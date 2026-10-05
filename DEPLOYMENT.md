# Manual Cloud Run deployment

The Deploy to Cloud Run workflow runs only when you click Run workflow on the
main branch. Merging this PR does not deploy anything.

Each run deploys the checked-out commit of texter to the existing Cloud Run
service, directs 100% of traffic to the latest revision, and checks /ping.
The run summary records the commit and service URL. Runs are serialized.
A failed post-deployment health check does not automatically roll traffic back.

## 1. Confirm the existing service

Open Google Cloud Shell in the davidlwatsonjr project and run:

~~~bash
gcloud run services list --project=davidlwatsonjr \
  --format="table(metadata.name,metadata.labels.'cloud.googleapis.com/location',status.url)"
~~~

Record the region of texter. Do not infer it from a local gcloud default.
Check that the service's runtime environment variables and Secret Manager
references contain the values it needs. The container now starts with
node src/index.js and relies on those Cloud Run settings, rather than a local
.env file. Existing runtime environment, secrets, runtime service account,
and ingress settings are not supplied or replaced by this workflow.

## 2. Create the shared trust pool (once for all five repos)

These commands change Google Cloud IAM and require an account with permission
to administer the project and service accounts. Run them yourself in Cloud Shell.
Use a new pool name if github-deploy is already in use; do not replace an existing
provider without reviewing its current trust configuration.

~~~bash
PROJECT_ID="davidlwatsonjr"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
POOL_ID="github-deploy"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"

gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" --location=global \
  --display-name="GitHub manual Cloud Run deployments"
~~~

Create the pool once. On subsequent repo setups, set the same three shell
variables and reuse the existing pool.

## 3. Create this repo's provider and deployment service account

~~~bash
SERVICE="texter"
REGION="REPLACE_WITH_EXISTING_SERVICE_REGION"
REPOSITORY_ID="691770871"
DEFAULT_BRANCH="main"
DEPLOY_ACCOUNT="github-${SERVICE}-deploy"
DEPLOY_EMAIL="${DEPLOY_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam workload-identity-pools providers create-oidc "$SERVICE" \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL_ID" \
  --display-name="Manual deployment for $SERVICE" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name" \
  --attribute-condition="assertion.repository_owner_id == '1317267' && assertion.repository_id == '$REPOSITORY_ID' && assertion.ref == 'refs/heads/$DEFAULT_BRANCH' && assertion.event_name == 'workflow_dispatch'"

gcloud iam service-accounts create "$DEPLOY_ACCOUNT" \
  --project="$PROJECT_ID" --display-name="GitHub deployer for $SERVICE"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository_id/${REPOSITORY_ID}"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_EMAIL" --role="roles/run.sourceDeveloper"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$DEPLOY_EMAIL" --role="roles/serviceusage.serviceUsageConsumer"

RUNTIME_ACCOUNT="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"
test -n "$RUNTIME_ACCOUNT"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_ACCOUNT" \
  --project="$PROJECT_ID" --member="serviceAccount:$DEPLOY_EMAIL" \
  --role="roles/iam.serviceAccountUser"
~~~

Each repo gets its own deployer identity. The provider admits only the numeric
owner/repo IDs above, the default branch, and manual workflow events.
The built-in Source Developer role is granted at project scope as required for
source deployment; it is broader than permission to update just one service.

## 4. Confirm the Cloud Build identity

This workflow uses Cloud Run's default source-build identity. Identify it:

~~~bash
gcloud builds get-default-service-account --project="$PROJECT_ID" --region="$REGION"
~~~

Copy its service-account email into BUILD_ACCOUNT below. If the output is a
resource path, use the email after serviceAccounts/. This is a different role
from the Cloud Run runtime identity; they can happen to use the same account.

~~~bash
BUILD_ACCOUNT="REPLACE_WITH_BUILD_SERVICE_ACCOUNT_EMAIL"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_ACCOUNT" --role="roles/run.builder"

gcloud iam service-accounts add-iam-policy-binding "$BUILD_ACCOUNT" \
  --project="$PROJECT_ID" --member="serviceAccount:$DEPLOY_EMAIL" \
  --role="roles/iam.serviceAccountUser"
~~~

An existing custom build identity should be reviewed before adopting the default
build identity. If you need to preserve a custom identity, add an explicit
--build-service-account flag to the workflow and authorize that account instead.

## 5. Set GitHub repository variables

In this repository, open Settings > Secrets and variables > Actions > Variables.
Add these repository variables, not JSON credential secrets:

| Variable | Value |
| --- | --- |
| GCP_PROJECT_ID | davidlwatsonjr |
| GCP_REGION | The existing service region recorded above |
| GCP_DEPLOY_SERVICE_ACCOUNT | github-texter-deploy@davidlwatsonjr.iam.gserviceaccount.com |
| GCP_WORKLOAD_IDENTITY_PROVIDER | Full provider name from the command below |
| CLOUD_RUN_HEALTHCHECK_URL | Optional full HTTPS /ping URL, if the default run.app URL is unavailable |

~~~bash
gcloud iam workload-identity-pools providers describe "$SERVICE" \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL_ID" --format='value(name)'
~~~

The provider name contains the numeric project number, not the project ID.
No service-account key needs to be created, downloaded, or uploaded.
Temporary credentials generated during the job are excluded from git,
Cloud Build source uploads, and the Docker build context.

Allow several minutes for IAM changes to propagate. The health check assumes
its URL is reachable publicly. For a private service, adapt the health check
to use an identity token rather than weakening the service's access policy.

## 6. Run the first deployment

Merge this PR, then open Actions > Deploy to Cloud Run > Run workflow.
Select main and click Run workflow. Feature-branch runs are skipped.
Choose movies as the first service if configuring all five repositories.

The job checks required variables and confirms the service exists before
deploying. Deployment uses the existing Dockerfile through Cloud Build.
It invokes the deployment action directly rather than npm run deploy, so the
legacy predeploy/postdeploy image and bucket deletion scripts are not run.

After a successful run, check the application and confirm a request to
/wp-login.php returns 403. If the workflow fails after deployment, inspect
Cloud Run's latest revision and traffic settings before retrying.

## References

- [Source deployment roles](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Workload Identity Federation for deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google authentication action](https://github.com/google-github-actions/auth)
- [Google Cloud Run deployment action](https://github.com/google-github-actions/deploy-cloudrun)
