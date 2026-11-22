import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests always run against the shared source, never a stale packages/shared/dist.
    alias: {
      '@ruut/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // bcrypt with cost 10 is intentionally slow; leave room on slower machines.
    testTimeout: 20_000,
  },
});
