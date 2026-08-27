import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Build separado para o content script: precisa ser um único arquivo sem
// declarações de import/export, pois o Chrome injeta content scripts como
// script clássico, não como módulo ES.
export default defineConfig({
  build: {
    outDir: 'dist/assets',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/sei-enhancer.ts'),
      formats: ['iife'],
      name: 'SeiRadarContent',
      fileName: () => 'content.js',
    },
  },
});
