import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: { cpus: 2 },
  async rewrites() {
    return { beforeFiles: [
      { source: '/favicon.ico', destination: '/icon.svg' },
      { source: '/_docs-media/:fileName', destination: '/api/docs/media/:fileName' },
      { source: '/_music-media/:fileName', destination: '/api/music/media/:fileName' },
    ], afterFiles: [], fallback: [] };
  },
  outputFileTracingIncludes: { '/api/dashboard/usage': ['../../packages/dashboard/dist/dashboard-usage-worker.mjs'] },
  serverExternalPackages: ['ccusage'],
  transpilePackages: ['@incept/db', '@incept/music', '@incept/roadmap', '@incept/dashboard'],
};

export default withNextIntl(nextConfig);
