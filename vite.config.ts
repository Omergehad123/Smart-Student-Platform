
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // تم تحديث المفتاح هنا لضمان عمل المنصة بشكل مستقر
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || 'AIzaSyBJy27rx7M00lPKDjrMtI1D-JRIAgAOoAQ'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          genai: ['@google/genai'],
        },
      },
    },
  },
});
