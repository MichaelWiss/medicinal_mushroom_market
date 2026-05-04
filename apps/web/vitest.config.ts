import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Map the same `@/*` path alias used by Next.js so that test files can
// import application modules with their normal paths.
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      // Next.js' `server-only` package is unresolvable in plain Node;
      // alias it to a noop so server modules import cleanly under vitest.
      'server-only': fileURLToPath(
        new URL('./test/server-only-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      '**/__tests__/**/*.test.ts',
      '**/__tests__/**/*.test.tsx',
    ],
  },
});
