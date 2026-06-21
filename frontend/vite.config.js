import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Required for Docker to expose the port
    port: 5173,
    proxy: {
      // 1. Proxy API requests to the Node backend
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
      // 2. Proxy Storage requests to the MinIO container (Mimicking Nginx!)
      '/storage': {
        target: 'http://minio:9000',
        changeOrigin: true,
        // This strips "/storage" off the URL before sending it to MinIO,
        // exactly like our Nginx rewrite rule does.
        rewrite: (path) => path.replace(/^\/storage/, '')
      }
    }
  }
})