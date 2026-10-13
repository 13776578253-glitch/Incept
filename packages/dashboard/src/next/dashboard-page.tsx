import 'server-only';

import { readDashboardSnapshot } from '../adapters';
import { emptyDashboard, publicDashboardSummary } from '../domain';
import { TokenDashboardFeature } from '../react';

export async function TokenDashboardPage({ canImport = false }: { canImport?: boolean } = {}) {
  const history = await readDashboardSnapshot('30d');

  const data = history ?? emptyDashboard();
  return <TokenDashboardFeature key={canImport ? 'owner' : 'public'} data={canImport ? data : publicDashboardSummary(data)} canImport={canImport} initialStatus={history ? 'history' : 'empty'} />;
}
