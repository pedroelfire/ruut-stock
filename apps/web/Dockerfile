# Web (Next.js + BFF) image. Build context: the repo root (see .railway/railway.ts), because the
# app needs the pnpm workspace and packages/shared.
FROM node:24-slim

# Same pnpm as packageManager in the root package.json.
RUN npm install -g pnpm@9.7.1

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
# No runtime secrets needed here: lib/env.ts is read per request, not at import time.
RUN pnpm --filter "@ruut/web..." build

ENV NODE_ENV=production
WORKDIR /app/apps/web
# next start listens on $PORT (3000, set in .railway/railway.ts so the public domain targets it).
CMD ["node", "node_modules/next/dist/bin/next", "start"]
