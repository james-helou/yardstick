# One image, two services. The web service and the queue worker run the same code with
# different start commands, so they can never drift out of sync on Railway.
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# Next reads env at build time only for statically evaluated values. Every page that
# touches the database is force-dynamic, so no database connection is needed here.
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# Dev dependencies stay in the image on purpose: the worker and the migration runner are
# TypeScript entrypoints executed through tsx.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/docker-entrypoint.sh ./
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
