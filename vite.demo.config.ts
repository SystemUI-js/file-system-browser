import { defineConfig } from 'vite';
import { resolve } from 'path';

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
    alias: {
      '@system-ui-js/file-system-browser': resolve(__dirname, 'src/index.ts'),
    },
  },
});
