import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 本机环境可能带着 NODE_ENV=production：React 会据此加载 production 构建，而它不导出 act，Testing Library 会直接崩
    env: { NODE_ENV: 'test' },
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // core 的 73 例是 node:test 语义：vitest 不得吞并，由 test:core 以 node --test 跑法运行（折叠防漏）
    exclude: [...configDefaults.exclude, 'src/core/**'],
    unstubGlobals: true,
  },
});
