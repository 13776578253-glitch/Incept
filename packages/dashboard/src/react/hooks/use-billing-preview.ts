import { useEffect, useState } from 'react';
import type { BillingReadResponse, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

export type BillingPreview = { status: 'loading' | 'unavailable' } | { status: 'ready'; data: BillingReadResponse };

export function useBillingPreview(enabled: boolean, range: UsageRange, refreshCycle: number): BillingPreview | undefined {
  const activeRange = enabled ? range : undefined;
  const [result, setResult] = useState<{ range: UsageRange | undefined; preview: BillingPreview }>(
    { range: activeRange, preview: { status: 'loading' } },
  );
  if (result.range !== activeRange) {
    setResult({ range: activeRange, preview: { status: 'loading' } });
  }

  useEffect(() => {
    if (!activeRange) return;
    const request = new AbortController();
    const query = new URLSearchParams({ range: activeRange });
    void fetch(`${dashboardEndpoints.billing}?${query}`, { cache: 'no-store', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw Error('Billing snapshot unavailable');
        const data: BillingReadResponse = await response.json();
        if (data.range !== activeRange) throw Error('Billing window mismatch');
        if (!request.signal.aborted) setResult({ range: activeRange, preview: { status: 'ready', data } });
      })
      .catch(() => {
        if (!request.signal.aborted) setResult({ range: activeRange, preview: { status: 'unavailable' } });
      });
    return () => request.abort();
  }, [activeRange, refreshCycle]);

  return activeRange ? result.preview : undefined;
}
