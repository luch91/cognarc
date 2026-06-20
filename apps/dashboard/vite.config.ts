import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api/score': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api\/score/, '/score'),
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api\/health/, '/health'),
        changeOrigin: true,
      },
      '/api/extract': {
        target: 'http://localhost:3008',
        rewrite: (path) => path.replace(/^\/api\/extract/, '/extract'),
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query', '@tanstack/react-virtual'],
        },
      },
    },
  },
})
