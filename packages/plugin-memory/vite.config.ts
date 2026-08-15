import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'FileSystemPluginMemory',
      formats: ['es', 'umd'],
      fileName: (format) =>
        format === 'umd'
          ? 'file-system-plugin-memory.umd.cjs'
          : 'file-system-plugin-memory.es.js',
    },
    rollupOptions: {
      external: ['@system-ui-js/file-system-browser'],
      output: {
        globals: {
          '@system-ui-js/file-system-browser': 'FileSystem',
        },
      },
    },
  },
});
