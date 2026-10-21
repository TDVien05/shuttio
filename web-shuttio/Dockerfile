# syntax=docker/dockerfile:1

# Stages: `dev` (docker compose, Vite dev server) and the default final stage
# (production: Nitro node server, ~only `.output/`).

FROM node:26-slim AS base
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# Vite inlines VITE_* into the client bundle, so they are build args, not
# runtime env vars. None of them are secrets.
FROM deps AS build
ARG VITE_API_URL
ARG VITE_CENTRIFUGO_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_MAPBOX_TOKEN
ARG VITE_CLOUDINARY_CLOUD_NAME
COPY . .
RUN pnpm build

FROM node:26-alpine AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", ".output/server/index.mjs"]
