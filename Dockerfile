# API server only — requires building from the monorepo root (workspace:* links).
# Railway: use repo root as the service root directory, or use this Dockerfile builder.
FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts

ENV CI=true
RUN pnpm install --frozen-lockfile

RUN pnpm run build:api-server

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
