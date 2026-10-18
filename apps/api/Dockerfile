# Build context is the repository root (see compose.yaml).
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /repo

# manifests first, so the dependency layer is cached until a package.json changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @opencourse/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# pnpm 9 deploy links the workspace root bins (vite, tsc...) in the wrong directory and logs
# harmless WARNs for them; the runtime only runs node, so the deploy step logs errors only
RUN pnpm --filter @opencourse/api build \
  && pnpm --loglevel=error --filter @opencourse/api deploy --prod /out

FROM node:26-alpine
ENV NODE_ENV=production
# the worker encodes uploaded videos; the API shares the image, so it carries ffmpeg too
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
