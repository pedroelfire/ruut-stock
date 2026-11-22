# API image. Build context: the repo root (see .railway/railway.ts), because the service needs the
# pnpm workspace and packages/shared.
FROM node:24-slim

# Prisma's schema engine (migrate deploy) needs OpenSSL; node:slim does not ship it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Same pnpm as packageManager in the root package.json.
RUN npm install -g pnpm@9.7.1

WORKDIR /app
COPY . .

# devDependencies stay installed on purpose: the pre-deploy step runs the seed with tsx.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@ruut/api..." build

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 4000
# node as PID 1 (not pnpm) so SIGTERM from Railway reaches the server directly.
CMD ["node", "dist/index.js"]
