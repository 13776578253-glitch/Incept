import 'server-only';

import { readDashboardSnapshot } from '../adapters';
import { emptyDashboard, publicDashboardSummary } from '../domain';
import { TokenDashboardFeature } from '../react';

export async function TokenDashboardPage({ canImport = false, canViewDetails = canImport }: { canImport?: boolean; canViewDetails?: boolean } = {}) {
  const history = await readDashboardSnapshot('30d');

  const data = history ?? emptyDashboard();
  return <TokenDashboardFeature key={canImport ? 'owner' : canViewDetails ? 'pro' : 'public'} data={canImport ? data : publicDashboardSummary(data, canViewDetails)} canImport={canImport} canViewDetails={canViewDetails} initialStatus={history ? 'history' : 'empty'} />;
}
