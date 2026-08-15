import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: '/file-system-browser/',
  server: {
    port: 9973,
    host: true,
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  resolve: {
    conditions: ['source', 'module', 'browser', 'development', 'production'],
  },
});
