import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: fromRoot('./src/') },
      // Tests always run against the shared source, never a stale packages/shared/dist.
      { find: /^@ruut\/shared$/, replacement: fromRoot('../../packages/shared/src/index.ts') },
      // The real package throws outside a React Server environment; tests run plain Node.
      { find: /^server-only$/, replacement: fromRoot('./test/stubs/server-only.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    // Node by default (route handlers, proxy); component tests opt into jsdom per file.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
});
