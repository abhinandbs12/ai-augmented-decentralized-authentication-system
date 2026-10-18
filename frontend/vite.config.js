import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the backend, so the SPA and the API share one origin
// (http://localhost:5173) and the backend needs no CORS configuration.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
