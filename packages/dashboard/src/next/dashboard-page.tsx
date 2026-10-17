import 'server-only';

import { readDashboardSnapshot } from '../adapters';
import { emptyDashboard, publicDashboardSummary } from '../domain';
import { TokenDashboardFeature } from '../react';

export async function TokenDashboardPage({ canImport = false, canViewDetails = canImport }: { canImport?: boolean; canViewDetails?: boolean } = {}) {
  const history = await readDashboardSnapshot('30d');

  const original = history ?? emptyDashboard();
  const mode=process.env.INCEPT_SYNC_READ_MODE==='v2'?'v2':process.env.INCEPT_SYNC_READ_MODE==='shadow'?'shadow':'v1';
  const data=canImport&&process.env.INCEPT_SYNC_REMOTE_ENABLED==='1'?{...original,sync:{remote:true,readMode:mode as 'v1'|'shadow'|'v2',intervalMs:Math.max(300000,Math.min(600000,Number(process.env.INCEPT_SYNC_POLL_MS??300000)))}}:original;
  return <TokenDashboardFeature key={canImport ? 'owner' : canViewDetails ? 'pro' : 'public'} data={canImport ? data : publicDashboardSummary(data, canViewDetails)} canImport={canImport} canViewDetails={canViewDetails} initialStatus={history ? 'history' : 'empty'} />;
}
