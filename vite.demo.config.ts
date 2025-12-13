import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  base: '/file-system/',
  server: {
    port: 9973,
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
