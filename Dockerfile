FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# node:20-alpine has no tzdata by default, so a non-UTC TZ env var would be
# silently ignored without this - needed for reminders created via the HA
# dashboard card or the old Flutter app's date format (see docker-compose.yml
# / .env.example's TZ variable and README's "Timezones" note).
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY public ./public
EXPOSE 8086
CMD ["node", "dist/index.js"]
