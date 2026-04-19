import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Visible_angle_calculater/',
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
  },
});
