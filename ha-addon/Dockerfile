# Home Assistant add-on image.
#
# IMPORTANT: build this with the *repository root* as the build context, not
# this ha-addon/ folder, since it needs ../src, ../package.json, etc:
#
#   docker build -f ha-addon/Dockerfile -t whatsapp-reminder-addon .
#
# The HA Supervisor does this automatically for local add-ons that live
# inside a larger repo checkout - point Settings -> Add-ons -> Add-on Store
# -> repositories at the root of this repo, and the Supervisor will use this
# Dockerfile with the repo root as context.
ARG BUILD_FROM
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM $BUILD_FROM
RUN apk add --no-cache nodejs npm
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY ha-addon/run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
