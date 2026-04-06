import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/prepare-workspace': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/simulate': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/strategies': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/results': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
