# Build context is the repository root (see compose.yaml).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @opencourse/web...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Vite bakes the API URL into the bundle, so it is a build argument, not a runtime variable
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @opencourse/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
