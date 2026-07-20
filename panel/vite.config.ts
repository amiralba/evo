/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // FullCalendar ships CJS+ESM; without pre-bundling them together Vite loads two copies of
    // @fullcalendar/core and the view classes crash ("Class constructor … without 'new'").
    include: ['@fullcalendar/core', '@fullcalendar/react', '@fullcalendar/multimonth', '@fullcalendar/daygrid'],
  },
  server: {
    // Allow ngrok/cloudflare tunnel hosts so the dev server doesn't reject shared demo URLs.
    // Local-demo convenience only; harmless to keep.
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5076',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
    css: true,
  },
})
