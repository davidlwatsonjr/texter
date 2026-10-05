# Manual Cloud Run deployment

The Deploy to Cloud Run workflow runs only when you click Run workflow on the
main branch. Merging this PR does not deploy anything.

Each run builds the checked-out commit of texter with Docker on the GitHub-hosted
runner, pushes the image to Artifact Registry, and deploys that exact image digest
to the existing Cloud Run service. Cloud Build is not used. Artifact Registry
stores the image, and Cloud Run runs it. Builds target linux/amd64.
The workflow directs 100% of traffic to the latest revision and checks /ping.
The run summary records the commit, image digest, and service URL. Runs are serialized.
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
If the service already receives a JSON secret bundle as SECRETS, keep that binding.
The application expands that bundle into environment variables at startup.
The GitHub runner does not fetch the application secret or create a .env file.

## 2. Create the shared trust pool (once for all five repos)

These commands change Google Cloud IAM and require an account with permission
to administer the project and service accounts. Run them yourself in Cloud Shell.
Use a new pool name if github-deploy is already in use; do not replace an existing
provider without reviewing its current trust configuration.

~~~bash
PROJECT_ID="davidlwatsonjr"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
POOL_ID="github-deploy"

gcloud services enable run.googleapis.com \
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

gcloud run services add-iam-policy-binding "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:$DEPLOY_EMAIL" --role="roles/run.developer"
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
Cloud Run Developer is scoped to the existing service. Service Account User is
scoped to that service's runtime identity. Workload Identity User lets this
repository impersonate its deployment account.

## 4. Create an Artifact Registry repository and grant image access

Use one Docker repository per service, in the same project and region as Cloud Run.
Create it once; if an appropriate repository already exists, reuse it and set
ARTIFACT_REPOSITORY to its name instead.

~~~bash
ARTIFACT_REPOSITORY="$SERVICE"

gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \\
  --project="$PROJECT_ID" --location="$REGION" --repository-format=docker \\
  --description="Container images for $SERVICE built by GitHub Actions"

gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY" \\
  --project="$PROJECT_ID" --location="$REGION" \\
  --member="serviceAccount:$DEPLOY_EMAIL" --role="roles/artifactregistry.writer"
~~~

Artifact Registry Writer includes read access needed for deployment. The deployer
can push images only to its assigned repository. No Cloud Build API, build service
account, or Cloud Run Builder role is needed for this workflow.
For repositories in this same project, the Cloud Run service agent's existing
Cloud Run Service Agent role normally includes image read access. If that role
was customized, confirm that it can read this Artifact Registry repository.

If you followed the earlier source-deployment setup, keep the pool, provider,
deployment account, Workload Identity User binding, and Service Usage Consumer
role. After granting the service-level Cloud Run Developer role above, remove the
project-level Source Developer grant from this dedicated deployment account:

~~~bash
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \\
  --member="serviceAccount:$DEPLOY_EMAIL" --role="roles/run.sourceDeveloper"
~~~

Skip that removal command if the grant was never added. Review any existing
Cloud Build permissions before removing them; other deployments may still use them.

## 5. Set GitHub repository variables

In this repository, open Settings > Secrets and variables > Actions > Variables.
Add these repository variables, not JSON credential secrets:

| Variable | Value |
| --- | --- |
| GCP_PROJECT_ID | davidlwatsonjr |
| GCP_REGION | The existing service region recorded above; also the Artifact Registry location |
| GCP_ARTIFACT_REPOSITORY | texter, or the existing Docker repository chosen above |
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
source uploads, and the Docker build context. Docker builds finish before Google
credentials are created.

Allow several minutes for IAM changes to propagate. The health check assumes
its URL is reachable publicly. For a private service, adapt the health check
to use an identity token rather than weakening the service's access policy.

## 6. Run the first deployment

Merge this PR, then open Actions > Deploy to Cloud Run > Run workflow.
Select main and click Run workflow. Feature-branch runs are skipped.
Choose movies as the first service if configuring all five repositories.

The job checks required variables and confirms the service exists before
deploying. Docker builds the image on the GitHub runner using the existing
Dockerfile. Each image tag includes the commit SHA, workflow run ID, and attempt;
the deployment uses the pushed image digest rather than a mutable latest tag.
It invokes the deployment action directly rather than npm run deploy, so the
legacy predeploy/postdeploy image and bucket deletion scripts are not run.

After a successful run, check the application and confirm a request to
/wp-login.php returns 403. If the workflow fails after deployment, inspect
Cloud Run's latest revision and traffic settings before retrying.

## References

- [Container image deployment roles](https://docs.cloud.google.com/run/docs/deploying)
- [Artifact Registry access control](https://docs.cloud.google.com/artifact-registry/docs/access-control)
- [Workload Identity Federation for deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google authentication action](https://github.com/google-github-actions/auth)
- [Google Cloud Run deployment action](https://github.com/google-github-actions/deploy-cloudrun)
