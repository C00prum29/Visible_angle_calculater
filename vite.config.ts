import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@mediapipe/pose', '@mediapipe/camera_utils', '@mediapipe/drawing_utils'],
    include: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      external: ['@mediapipe/pose', '@mediapipe/camera_utils', '@mediapipe/drawing_utils'],
    },
  },
});
