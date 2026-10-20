# syntax=docker/dockerfile:1

# Development image: deps installed at build time; docker-compose syncs source
# in via Compose Watch and runs the Vite dev server.
FROM node:26-slim AS base
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS dev
EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# Production: Vite inlines VITE_* into the bundle at build time, so they are
# build args rather than runtime env vars.
FROM base AS build
ARG VITE_API_URL=http://localhost:6969
ARG VITE_CLERK_PUBLISHABLE_KEY=
ARG VITE_MAPBOX_TOKEN=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
RUN pnpm build

FROM node:26-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
