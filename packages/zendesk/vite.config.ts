import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/assets',
    emptyOutDir: true,
    assetsDir: '.',
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@zendesk-sms-tool/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 4000,
  },
});

