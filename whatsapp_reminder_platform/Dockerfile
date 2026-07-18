# Home Assistant app (formerly "add-on") image.
#
# This is built by CI ONLY (.github/workflows/build-app-image.yml), not by
# the Supervisor on-device - config.yaml's `image:` field tells Supervisor
# to pull the prebuilt result from GHCR instead of running a local Docker
# build. That matters on small devices (Raspberry Pi, etc.): compiling
# TypeScript and running `npm install` at install time can exhaust RAM and
# hang the whole box. Building once on GitHub's servers and just *pulling* a
# finished multi-arch image avoids that entirely.
#
# Because CI checks out the full repo, the build context here is the repo
# root (see the workflow's `context: .` / `file: whatsapp_reminder_platform/
# Dockerfile`), so this can COPY src/, package.json, etc. directly - no need
# to git-clone itself the way the old on-device version did.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM ghcr.io/home-assistant/base:latest
ARG BUILD_VERSION

RUN apk add --no-cache nodejs npm

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY whatsapp_reminder_platform/run.sh /run.sh
RUN chmod a+x /run.sh

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="aarch64|amd64"

CMD ["/run.sh"]
