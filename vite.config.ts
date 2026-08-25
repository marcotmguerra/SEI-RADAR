import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import fs from 'node:fs';

const copyExtensionFilesPlugin = () => ({
  name: 'copy-extension-files',
  closeBundle() {
    const distDir = resolve(__dirname, 'dist');
    const iconsDir = resolve(__dirname, 'icons');
    const distIconsDir = resolve(distDir, 'icons');

    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Copia manifest.json
    fs.copyFileSync(
      resolve(__dirname, 'manifest.json'),
      resolve(distDir, 'manifest.json')
    );

    // Copia pasta icons
    if (fs.existsSync(iconsDir)) {
      if (!fs.existsSync(distIconsDir)) {
        fs.mkdirSync(distIconsDir, { recursive: true });
      }
      fs.readdirSync(iconsDir).forEach((file) => {
        fs.copyFileSync(
          resolve(iconsDir, file),
          resolve(distIconsDir, file)
        );
      });
    }

    console.log('✓ Manifest e ícones copiados com sucesso para a pasta dist/');
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionFilesPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        offscreen: resolve(__dirname, 'offscreen.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'assets/background.js';
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});

