import 'server-only';

import { createHash } from 'node:crypto';
import type { TokenDashboardData } from '../domain';

/** Only compute validators after the caller has projected data for the viewer. */
export function dashboardUsageRepresentation(data: TokenDashboardData, canViewDetails: boolean) {
  const body = JSON.stringify(data);
  const digest = createHash('sha256')
    .update(canViewDetails ? 'pro:' : 'public:')
    .update(body)
    .digest('base64url');

  return { body, validator: `"${digest}"` };
}
