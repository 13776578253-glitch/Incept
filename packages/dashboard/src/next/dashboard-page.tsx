import 'server-only';

import { loadTokenDashboardData } from '../adapters';
import { TokenDashboardFeature } from '../react';

export async function TokenDashboardPage({ canImport = false }: { canImport?: boolean } = {}) {
  const data = await loadTokenDashboardData({ range: '30d' });

  return <TokenDashboardFeature data={data} canImport={canImport} />;
}
