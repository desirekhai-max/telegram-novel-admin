import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/uploads/novel-covers': 'http://127.0.0.1:8787',
      '/uploads/report-screenshots': 'http://127.0.0.1:8787',
      '/covers': 'http://127.0.0.1:8787',
    },
  },
})
