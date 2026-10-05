# Use the official lightweight Node.js 20 image.
# https://hub.docker.com/_/node
FROM node:20-alpine

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install dependencies.
# If you add a package-lock.json speed your build by switching to 'npm ci'.
RUN npm ci --only=production
# RUN npm install --production

# Copy local code to the container image.
COPY . ./

# Run the web service on container startup.
# Preserve .env-based npm startup; clean checkouts use Cloud Run's environment.
# exec forwards container shutdown signals to the selected process.
CMD ["sh", "-c", "if [ -f .env ]; then exec npm start; else exec node src/index.js; fi"]