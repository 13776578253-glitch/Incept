import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./src/__tests__/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
