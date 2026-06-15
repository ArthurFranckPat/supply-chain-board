import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '#resources': path.resolve('./resources'),
    },
  },
  build: {
    outDir: 'public',
    assetsDir: '',
    rollupOptions: {
      input: './resources/js/app.js',
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: '[ext]/[name].[ext]',
      },
    },
  },
})
