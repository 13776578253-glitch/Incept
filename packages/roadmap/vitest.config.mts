import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 本机环境可能带着 NODE_ENV=production：React 会据此加载 production 构建，而它不导出 act，Testing Library 会直接崩
    env: { NODE_ENV: 'test' },
  },
});
