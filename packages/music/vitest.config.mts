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
    // core 的 73 例使用 node:test 语义，由 test:core 以 node --test 独立运行，此处排除以免被 vitest 误吞
    // history: 原 @incept/music-player-core 折叠入 src/core 后保留原生 node:test 执行通道
    exclude: [...configDefaults.exclude, 'src/core/**'],
    unstubGlobals: true,
  },
});
