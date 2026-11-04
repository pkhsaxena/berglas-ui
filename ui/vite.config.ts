import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, vite proxies to the core and keeps the Host header, so the core's
// localhost checks still pass. The core picks a random port by default, so
// start it with a fixed one (-listen 127.0.0.1:8740) or set BERGLAS_UI_CORE.
// `npm run build` writes into the core so it can embed the ui.
const core = process.env.BERGLAS_UI_CORE ?? 'http://127.0.0.1:8740'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': core,
      '/auth': core,
    },
  },
  build: {
    outDir: '../core/webui/dist',
    emptyOutDir: true,
  },
})
