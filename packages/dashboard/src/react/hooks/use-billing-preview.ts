import { useEffect, useState } from 'react';
import type { BillingReadResponse, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

export type BillingPreview = { status: 'loading' | 'unavailable' } | { status: 'ready'; data: BillingReadResponse };

export function useBillingPreview(enabled: boolean, range: UsageRange, refreshCycle: number): BillingPreview | undefined {
  const key = `${range}:${refreshCycle}`;
  const [result, setResult] = useState<{ key: string; preview: BillingPreview }>();

  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    const query = new URLSearchParams({ range });
    void fetch(`${dashboardEndpoints.billing}?${query}`, { cache: 'no-store', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw Error('Billing snapshot unavailable');
        const data: BillingReadResponse = await response.json();
        if (data.range !== range) throw Error('Billing window mismatch');
        if (!request.signal.aborted) setResult({ key, preview: { status: 'ready', data } });
      })
      .catch(() => {
        if (!request.signal.aborted) setResult({ key, preview: { status: 'unavailable' } });
      });
    return () => request.abort();
  }, [enabled, key, range]);

  if (!enabled) return undefined;
  return result?.key === key ? result.preview : { status: 'loading' };
}
