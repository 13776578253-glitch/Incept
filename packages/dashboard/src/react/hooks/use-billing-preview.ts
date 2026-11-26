import { useEffect, useRef, useState } from 'react';
import type { BillingReadResponse, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

export type BillingPreview = { status: 'loading' | 'unavailable' } | { status: 'ready'; data: BillingReadResponse };

type CachedBilling = {
  data: BillingReadResponse;
  cycle: number;
  watermark?: number | string;
};
type Flight = {
  promise: Promise<BillingReadResponse>;
  controller: AbortController;
  cycle: number;
  watermark?: number | string;
};

function isBillingEntryFresh(
  cached: CachedBilling,
  refreshCycle: number,
  revisionWatermark?: number | string,
) {
  if (cached.cycle !== refreshCycle) return false;
  if (typeof revisionWatermark === 'number') {
    const billedRevision = cached.data.liveRevision ?? cached.data.revision;
    if (typeof billedRevision === 'number' && revisionWatermark > billedRevision) return false;
    if (typeof cached.watermark === 'number' && revisionWatermark !== cached.watermark) return false;
    return true;
  }
  return cached.watermark === revisionWatermark;
}

export function useBillingPreview(
  enabled: boolean,
  range: UsageRange,
  refreshCycle: number,
  revisionWatermark?: number | string,
): BillingPreview | undefined {
  const activeRange = enabled ? range : undefined;
  const readyCacheRef = useRef(new Map<UsageRange, CachedBilling>());
  // In-flight requests are keyed by range and survive pure range switches; only a newer cycle/watermark,
  // withdrawn access or unmount aborts them.
  const inFlightRef = useRef(new Map<UsageRange, Flight>());
  if (!enabled) readyCacheRef.current.clear();
  const cachedEntry = activeRange ? readyCacheRef.current.get(activeRange) : undefined;
  const [result, setResult] = useState<{ range: UsageRange | undefined; preview: BillingPreview }>(() => ({
    range: activeRange,
    preview: cachedEntry ? { status: 'ready', data: cachedEntry.data } : { status: 'loading' },
  }));
  if (result.range !== activeRange) {
    setResult({
      range: activeRange,
      preview: cachedEntry ? { status: 'ready', data: cachedEntry.data } : { status: 'loading' },
    });
  }

  useEffect(() => {
    const flights = inFlightRef.current;
    return () => {
      for (const flight of flights.values()) flight.controller.abort();
      flights.clear();
    };
  }, []);
  useEffect(() => {
    if (enabled) return;
    for (const flight of inFlightRef.current.values()) flight.controller.abort();
    inFlightRef.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (!activeRange) return;
    // Abort any obsolete in-flight requests across all ranges when cycle or watermark advances.
    for (const [flightRange, entry] of inFlightRef.current.entries()) {
      if (entry.cycle !== refreshCycle || entry.watermark !== revisionWatermark || entry.controller.signal.aborted) {
        entry.controller.abort();
        inFlightRef.current.delete(flightRange);
      }
    }
    const existing = readyCacheRef.current.get(activeRange);
    if (existing && isBillingEntryFresh(existing, refreshCycle, revisionWatermark)) {
      setResult(prev => prev.range === activeRange && prev.preview.status === 'ready' && prev.preview.data === existing.data
        ? prev
        : { range: activeRange, preview: { status: 'ready', data: existing.data } });
      return;
    }
    let flight = inFlightRef.current.get(activeRange);
    if (!flight) {
      const controller = new AbortController();
      const query = new URLSearchParams({ range: activeRange });
      const promise = fetch(`${dashboardEndpoints.billing}?${query}`, { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw Error('Billing snapshot unavailable');
          const data: BillingReadResponse = await response.json();
          if (data.range !== activeRange) throw Error('Billing window mismatch');
          return data;
        });
      const created: Flight = { promise, controller, cycle: refreshCycle, watermark: revisionWatermark };
      inFlightRef.current.set(activeRange, created);
      // Populate the cache even if the user has already switched away from this range.
      promise.then(data => {
        if (!controller.signal.aborted) readyCacheRef.current.set(activeRange, { data, cycle: refreshCycle, watermark: revisionWatermark });
      }, () => {
        if (!controller.signal.aborted) readyCacheRef.current.delete(activeRange);
      }).finally(() => {
        if (inFlightRef.current.get(activeRange) === created) inFlightRef.current.delete(activeRange);
      });
      flight = created;
    }
    let detached = false;
    const { promise, controller } = flight;
    promise.then(data => {
      if (!detached && !controller.signal.aborted) setResult({ range: activeRange, preview: { status: 'ready', data } });
    }, () => {
      if (!detached && !controller.signal.aborted) setResult({ range: activeRange, preview: { status: 'unavailable' } });
    });
    return () => { detached = true; };
  }, [activeRange, refreshCycle, revisionWatermark]);

  return activeRange ? result.preview : undefined;
}
