// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useDashboardWindow} from '../react/hooks/use-dashboard-window';
import {emptyDashboard} from '../domain';
beforeEach(()=>{window.sessionStorage.clear();vi.useFakeTimers();vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const initial=()=>({...emptyDashboard('7d'),sync:{remote:true,readMode:'v2' as const,intervalMs:300000},checkedAt:'2026-10-01T00:00:00Z'});
const reply=(value:unknown)=>({ok:true,json:async()=>value});
it('loads remote device status on a live mount without requesting usage',async()=>{
  const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(String(url));return reply({remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'device',name:'Windows',online:true}]});}));
  const {result}=renderHook(()=>useDashboardWindow(initial(),{owner:true,loadRemoteOnMount:true}));
  await act(async()=>{});
  expect(calls).toHaveLength(1);expect(calls[0]).toContain('/devices/status');
  expect(result.current.remoteInfo?.devices[0].name).toBe('Windows');
  expect(result.current.remoteDevice).toBe('device');
});
it('remote refresh waits for Job completion before reading the required revision, and merges repeated local clicks',async()=>{
  const calls:string[]=[];let finish!:(v:unknown)=>void;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(String(url));if(url.endsWith('/devices/status'))return reply({remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'device',name:'Windows',online:true,activity:'collecting',lastCollectedAt:'2026-10-01T00:00:00Z',lastCommittedAt:'2026-10-01T00:01:00Z'}]});
    if(url.endsWith('/jobs'))return reply({job:{id:'job',status:'running',phase:'collecting',online:true,dataRevision:null}});if(url.endsWith('/jobs/job'))return new Promise(resolve=>{finish=resolve;});
    return reply({...initial(),sync:{readMode:'v2',dataRevision:4},totals:{...initial().totals,totalTokens:120}});
  }));
  const {result}=renderHook(()=>useDashboardWindow(initial(),{owner:true}));await act(async()=>{result.current.refresh();result.current.refresh();});expect(calls.filter(c=>c.endsWith('/jobs'))).toHaveLength(1);expect(calls.some(c=>c.includes('/usage'))).toBe(false);expect(result.current.remoteState).toBe('collecting');
  await act(async()=>{vi.advanceTimersByTime(750);});await act(async()=>{finish(reply({job:{id:'job',status:'completed',phase:'committed',dataRevision:4}}));});expect(calls.find(c=>c.includes('/usage'))).toContain('minRevision=4');expect(calls.findIndex(c=>c.includes('/usage'))).toBeGreaterThan(calls.findIndex(c=>c.endsWith('/jobs/job')));expect(result.current.data.totals.totalTokens).toBe(120);expect(result.current.remoteState).toBe('committed');expect(result.current.lastPageUpdatedAt).toBeTruthy();
});
it('v1 display explicitly says data was stored in v2 and does not force a local collection',async()=>{
  const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(String(url));if(url.endsWith('/devices/status'))return reply({devices:[{id:'device',name:'Windows',online:true}]});if(url.endsWith('/jobs'))return reply({job:{id:'job',status:'completed',dataRevision:3}});return reply({...initial(),sync:{readMode:'v1'}});}));
  const {result}=renderHook(()=>useDashboardWindow(initial(),{owner:true}));await act(async()=>{result.current.refresh();});expect(result.current.remoteState).toBe('stored_v2');expect(calls.some(c=>c.includes('refresh=1'))).toBe(false);
});
it.each(['offline','expired','cancelled'] as const)('keeps the %s terminal state instead of reporting a generic failure',async status=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/devices/status'))return reply({remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'device',name:'Windows',online:status!=='offline'}]});
    if(url.endsWith('/jobs'))return reply({job:{id:'job',status,phase:status,online:status!=='offline',dataRevision:null}});
    return reply({...initial(),sync:{readMode:'v2',dataRevision:1},totals:{...initial().totals,totalTokens:120}});
  }));
  const {result}=renderHook(()=>useDashboardWindow(initial(),{owner:true}));
  await act(async()=>{result.current.refresh();});
  expect(result.current.remoteState).toBe(status);expect(result.current.refreshError).toBe(false);expect(result.current.data.totals.totalTokens).toBe(120);
});
it('cloud polling keeps its own five-minute clock and pauses while the page is hidden',async()=>{
  const fetch=vi.fn(async(url:string)=>url.endsWith('/devices/status')?reply({devices:[]}):reply(initial()));vi.stubGlobal('fetch',fetch);
  const {result}=renderHook(()=>useDashboardWindow(initial(),{owner:true}));await act(async()=>{vi.advanceTimersByTime(60000);});expect(fetch).toHaveBeenCalledTimes(0);expect(result.current.refreshInterval).toBe(300000);
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(600000);});expect(fetch).toHaveBeenCalledTimes(0);
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});expect(fetch).toHaveBeenCalledTimes(2);
});
it('ignores a delayed device response from an aborted refresh and never blocks usage on device status', async () => {
  let resolveOld!: (value: ReturnType<typeof reply>) => void;
  const fetch = vi.fn((url: string) => {
    if (url.endsWith('/devices/status')) {
      const statusCalls = fetch.mock.calls.filter(([value]) => value.endsWith('/devices/status')).length;
      if (statusCalls === 1) return new Promise<ReturnType<typeof reply>>(resolve => { resolveOld = resolve; });
      return Promise.resolve(reply({ devices: [{ id: 'new-device', name: 'New', online: true }] }));
    }
    return Promise.resolve(reply(initial()));
  });
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useDashboardWindow(initial(), { owner: true }));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(fetch.mock.calls.filter(([url]) => url.includes('/usage'))).toHaveLength(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.remoteInfo?.devices[0].id).toBe('new-device');
  expect(fetch.mock.calls.filter(([url]) => url.includes('/usage'))).toHaveLength(2);
  await act(async () => { resolveOld(reply({ devices: [{ id: 'old-device', name: 'Old', online: true }] })); });
  expect(result.current.remoteInfo?.devices[0].id).toBe('new-device');
  expect(fetch.mock.calls.filter(([url]) => url.includes('/usage'))).toHaveLength(2);
});
it('skips redundant device status calls during range switches once remote status is populated', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url));
    if (url.endsWith('/devices/status')) {
      return reply({ remoteEnabled: true, readMode: 'v2', intervalMs: 300000, devices: [{ id: 'dev-1', name: 'Win', online: true }] });
    }
    const range = new URL(url, 'http://localhost').searchParams.get('range') as '7d' | '30d' | 'all';
    return reply({ ...emptyDashboard(range), sync: { remote: true, readMode: 'v2', dataRevision: 10 }, checkedAt: '2026-10-02T00:00:00Z' });
  }));
  const { result } = renderHook(() => useDashboardWindow(initial(), { owner: true, loadRemoteOnMount: true }));
  await act(async () => {});
  expect(calls.filter(c => c.endsWith('/devices/status'))).toHaveLength(1);
  await act(async () => { result.current.setRangePreset('30d'); });
  await act(async () => { result.current.setRangePreset('all'); });
  expect(calls.filter(c => c.endsWith('/devices/status'))).toHaveLength(1);
  expect(calls.filter(c => c.includes('/usage'))).toHaveLength(2);
  expect(result.current.data.range).toBe('all');
});

it('refreshCharts re-reads usage snapshots without triggering a remote Agent capture job', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url));
    if (url.endsWith('/devices/status')) {
      return reply({ remoteEnabled: true, readMode: 'v2', intervalMs: 300000, devices: [{ id: 'dev-1', name: 'Win', online: true }] });
    }
    return reply({ ...initial(), sync: { remote: true, readMode: 'v2', dataRevision: 9 }, totals: { ...initial().totals, totalTokens: 999 } });
  }));
  const { result } = renderHook(() => useDashboardWindow(initial(), { owner: true }));
  await act(async () => { result.current.refreshCharts(); });
  expect(calls.some(c => c.endsWith('/jobs'))).toBe(false);
  expect(calls.some(c => c.includes('/usage'))).toBe(true);
  expect(result.current.data.totals.totalTokens).toBe(999);
  expect(result.current.data.sync?.dataRevision).toBe(9);
});

it('replays a 298s remote job and 115s snapshot lag with automatic recovery and zero duplicate jobs', async () => {
  const startTime = Date.now();
  let jobPostCount = 0;
  const initialData = {
    ...emptyDashboard('7d'),
    sync: { remote: true, readMode: 'v2' as const, dataRevision: 4574, intervalMs: 300000 },
    checkedAt: '2026-11-27T12:55:00Z',
    totals: { ...emptyDashboard('7d').totals, totalTokens: 100 },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const elapsed = Date.now() - startTime;
    if (url.endsWith('/devices/status')) {
      const done = elapsed >= 298_000;
      return reply({
        remoteEnabled: true,
        readMode: 'v2',
        intervalMs: 300000,
        devices: [{
          id: 'dev-1',
          name: 'Win',
          online: true,
          activity: jobPostCount > 0 && !done ? 'collecting' : 'idle',
          lastJob: jobPostCount > 0
            ? { id: 'job-4575', status: done ? 'completed' : 'running', phase: done ? 'committed' : 'collecting', dataRevision: done ? 4575 : null }
            : null,
        }],
      });
    }
    if (url.endsWith('/jobs') && init?.method === 'POST') {
      jobPostCount += 1;
      return reply({ job: { id: 'job-4575', status: 'running', phase: 'collecting', online: true, dataRevision: null, errorCode: null } });
    }
    if (url.endsWith('/jobs/job-4575')) {
      if (elapsed >= 298_000) {
        return reply({ job: { id: 'job-4575', status: 'completed', phase: 'committed', online: true, dataRevision: 4575, errorCode: null } });
      }
      return reply({ job: { id: 'job-4575', status: 'running', phase: elapsed >= 178_000 ? 'uploading' : 'collecting', online: true, dataRevision: null, errorCode: null } });
    }
    if (url.includes('/usage')) {
      // Snapshot takes 115s after the 298s commit (ready at 413s).
      if (elapsed < 413_000) {
        return {
          ok: false,
          status: 503,
          headers: new Headers({ 'Retry-After': '3' }),
          json: async () => ({ error: 'SNAPSHOT_UPDATING', targetRevision: 4575, publishedRevision: 4574, retryAfterSeconds: 3 }),
        };
      }
      return reply({
        ...initialData,
        checkedAt: '2026-11-27T13:04:00Z',
        sync: { remote: true, readMode: 'v2', dataRevision: 4575, intervalMs: 300000 },
        totals: { ...initialData.totals, totalTokens: 294_022 },
      });
    }
    throw Error('Unexpected URL: ' + url);
  }));

  const { result } = renderHook(() => useDashboardWindow(initialData, { owner: true }));
  await act(async () => { result.current.triggerRemoteSync(); });
  expect(jobPostCount).toBe(1);
  expect(result.current.activeRemoteJobId).toBe('job-4575');

  // Advance past the 180s active polling window: must become still_syncing, not failed.
  await act(async () => { await vi.advanceTimersByTimeAsync(181_000); });
  expect(result.current.remoteState).toBe('still_syncing');
  expect(result.current.refreshError).toBe(false);
  expect(result.current.activeRemoteJobId).toBe('job-4575');

  // Repeated click while still syncing must resume tracking job-4575, NEVER create a second Job.
  await act(async () => { result.current.triggerRemoteSync(); });
  expect(jobPostCount).toBe(1);

  // Hide and re-show the tab around 210s -> continues tracking job-4575 cleanly.
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(20_000); });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(jobPostCount).toBe(1);

  // Advance past 298s (Job commits rev 4575, snapshot is still lagging at 4574).
  await act(async () => { await vi.advanceTimersByTimeAsync(110_000); });
  expect(result.current.remoteState).toBe('updating_charts');
  expect(result.current.refreshError).toBe(false);
  expect(result.current.snapshotLag).toEqual({ targetRevision: 4575, publishedRevision: 4574 });
  expect(result.current.data.totals.totalTokens).toBe(100);
  expect(result.current.data.sync?.dataRevision).toBe(4574);
  expect(jobPostCount).toBe(1);

  // Advance through the remaining 115s snapshot delay -> automatically recovers without user action!
  await act(async () => { await vi.advanceTimersByTimeAsync(115_000); });
  expect(result.current.data.sync?.dataRevision).toBe(4575);
  expect(result.current.data.totals.totalTokens).toBe(294_022);
  expect(result.current.snapshotLag).toBeNull();
  expect(result.current.remoteState).toBe('committed');
  expect(result.current.refreshError).toBe(false);
  expect(jobPostCount).toBe(1);
});
