import 'server-only';

import { readDashboardSnapshot } from '../adapters';
import { emptyDashboard } from '../domain';
import { TokenDashboardFeature } from '../react';

export async function TokenDashboardPage({ canImport = false }: { canImport?: boolean } = {}) {
  const history = await readDashboardSnapshot('30d');

  return <TokenDashboardFeature data={history ?? emptyDashboard()} canImport={canImport} initialStatus={history ? 'history' : 'empty'} />;
}
