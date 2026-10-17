// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useDashboardWindow} from '../react/hooks/use-dashboard-window';
import {emptyDashboard} from '../domain';
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const initial=()=>({...emptyDashboard('7d'),sync:{remote:true,readMode:'v2' as const,intervalMs:300000},checkedAt:'2026-10-01T00:00:00Z'});
const reply=(value:unknown)=>({ok:true,json:async()=>value});
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
