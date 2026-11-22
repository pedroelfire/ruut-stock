// Prisma CLI configuration (migrate, generate, seed). Prisma 7 no longer reads .env files,
// so the local apps/api/.env is loaded here; on Railway the variables are already injected.
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read directly (not with env()) so `prisma generate` also works without a database URL,
    // e.g. in a build step. migrate and seed fail with a clear Prisma error if it is missing.
    url: process.env.DATABASE_URL,
  },
});
