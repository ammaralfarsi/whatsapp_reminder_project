# Home Assistant add-on image.
#
# The Supervisor builds each add-on using ONLY this folder as the Docker
# build context (it never sees the rest of the repo), so this Dockerfile
# fetches the actual app source (src/, package.json, migrations/) from the
# GitHub repo at build time instead of assuming it's sitting next to it.
#
# If you fork this repo, update APP_REPO_URL below to your fork's URL.
ARG BUILD_FROM
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

FROM $BUILD_FROM
RUN apk add --no-cache nodejs npm
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
