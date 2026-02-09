import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    headers: {
      // Required for snarkjs SharedArrayBuffer (multi-threaded proof generation)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8545',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
