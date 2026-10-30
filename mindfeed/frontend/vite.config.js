import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep MindFeed separate from other local projects. The backend target is configurable
// through MINDFEED_API_TARGET and defaults to port 8001 to avoid colliding with apps on 8000.
const apiTarget = process.env.MINDFEED_API_TARGET || 'http://127.0.0.1:8001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/robots.txt': apiTarget,
      '/sitemap.xml': apiTarget,
      '/llms.txt': apiTarget,
    },
  },
  build: {
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: { output: { manualChunks: { 'react-vendor': ['react', 'react-dom', 'react-router-dom'], 'icons': ['lucide-react'] } } },
  },
});
