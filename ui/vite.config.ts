import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The core (Go) serves the api on 127.0.0.1:8740. In dev, vite proxies to it
// and keeps the Host header, so the core's localhost checks still pass.
// `npm run build` writes into the core so it can embed the ui.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8740',
      '/auth': 'http://127.0.0.1:8740',
    },
  },
  build: {
    outDir: '../core/webui/dist',
    emptyOutDir: true,
  },
})
