import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 本机环境可能带着 NODE_ENV=production：React 会据此加载 production 构建，而它不导出 act，Testing Library 会直接崩
    env: { NODE_ENV: 'test' },
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    unstubGlobals: true,
  },
});
