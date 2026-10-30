import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 8240,
    // Cấm auto-port: nếu 8240 bận thì FAIL thay vì nhảy sang 8242 — vì
    // Library server chỉ cho CORS origin :8240, web chạy ở port khác sẽ
    // bị chặn API với lỗi "Không kết nối được Library server" khó hiểu.
    strictPort: true,
    // localhost mặc định: '0.0.0.0' expose dev app + HMR ra LAN.
    host: process.env.DEV_HOST || 'localhost',
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
