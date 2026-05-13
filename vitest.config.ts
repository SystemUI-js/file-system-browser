import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['source', 'module', 'browser', 'development', 'production'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
  },
});
