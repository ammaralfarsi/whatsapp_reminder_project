# Home Assistant app (formerly "add-on") image.
#
# As of Supervisor 2026.04.0, the Supervisor no longer injects a BUILD_FROM
# base image via build.yaml - that file is no longer read at all. The base
# image must be set directly with FROM (see
# https://developers.home-assistant.io/docs/apps/configuration). This is a
# multi-arch manifest image, so one FROM line covers aarch64 and amd64.
#
# The Supervisor builds each app using ONLY this folder as context, so this
# Dockerfile fetches the actual app source (src/, package.json,
# migrations/) from the GitHub repo at build time instead of assuming it's
# sitting next to it. If you fork this repo, update APP_REPO_URL below.
ARG APP_REPO_URL=https://github.com/ammaralfarsi/whatsapp_reminder_project.git
ARG APP_REPO_REF=main

FROM node:20-alpine AS build
ARG APP_REPO_URL
ARG APP_REPO_REF
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "$APP_REPO_REF" "$APP_REPO_URL" .
WORKDIR /app
RUN cp /src/package.json /src/tsconfig.json ./ && cp -r /src/src ./src && cp -r /src/migrations ./migrations
RUN npm install
RUN npm run build

FROM ghcr.io/home-assistant/base:latest
ARG BUILD_VERSION

RUN apk add --no-cache nodejs npm

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY run.sh /run.sh
RUN chmod a+x /run.sh

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="aarch64|amd64"

CMD ["/run.sh"]
