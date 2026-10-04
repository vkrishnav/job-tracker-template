import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
    // Same-origin API calls in dev; override with VITE_API_URL if the server runs elsewhere
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:3001', changeOrigin: true },
    },
  },
})
