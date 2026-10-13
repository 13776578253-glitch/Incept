import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  serverExternalPackages: ['ccusage'],
  transpilePackages: ['@incept/db', '@incept/music', '@incept/roadmap', '@incept/dashboard'],
};

export default withNextIntl(nextConfig);
