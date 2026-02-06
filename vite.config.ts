import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // Pasta de saída padrão para o build
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Proxy para desenvolvimento local, para evitar CORS ao chamar o backend localmente
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});