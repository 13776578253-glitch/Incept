// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,expect,it} from 'vitest';
import zh from '../messages/zh.json';
import {emptyDashboard} from '../domain';
import {DashboardToolbar} from '../react/components/dashboard-toolbar';

afterEach(cleanup);
it('shows the verified remote phase, backlog, refresh delta and all synchronization timestamps',()=>{
  render(<NextIntlClientProvider locale="zh" messages={{dashboard:zh}}><DashboardToolbar
    rangePreset="7d" setRangePreset={()=>{}} setSelectedTrendIndex={()=>{}} data={emptyDashboard('7d')}
    isRefreshing refreshError={false} onRefresh={()=>{}} refreshCycle={1} isPollingPaused={false}
    remoteInfo={{remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'device',name:'Windows',online:true,activity:'uploading',
      lastCollectedAt:'2026-10-17T10:00:00Z',lastCommittedAt:'2026-10-17T10:01:00Z',
      lastJob:{status:'completed_no_change',phase:'no_change',dataRevision:5,reviewTotal:40,reviewNew:0,newTokens:18371}}]}}
    remoteDevice="device" setRemoteDevice={()=>{}} remoteState="uploading" refreshInterval={300000}
    lastPageUpdatedAt="2026-10-17T10:02:00Z"/></NextIntlClientProvider>);
  expect(document.querySelector('[role="status"][data-remote-phase="uploading"]')).not.toBeNull();
  expect(screen.getByTestId('sync-timeline').textContent).toContain('Agent 最后采集');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('云端最后提交');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('Dashboard 最近读取');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('本次刷新');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('历史待审阅: 40');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('+18371 tokens');
  expect(screen.getByRole('button',{name:'正在上传'})).toBeDefined();
});
it('shows completed_no_change with a separate historical review count',()=>{
  render(<NextIntlClientProvider locale="zh" messages={{dashboard:zh}}><DashboardToolbar
    rangePreset="7d" setRangePreset={()=>{}} setSelectedTrendIndex={()=>{}} data={emptyDashboard('7d')}
    isRefreshing refreshError={false} onRefresh={()=>{}} refreshCycle={1} isPollingPaused={false}
    remoteInfo={{remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'device',name:'Windows',online:true,
      lastCollectedAt:'2026-10-18T06:37:50Z',lastCommittedAt:'2026-10-18T00:55:16Z',
      lastJob:{status:'completed_no_change',phase:'no_change',dataRevision:5,reviewTotal:40,reviewNew:0,newTokens:0}}]}}
    remoteDevice="device" setRemoteDevice={()=>{}} remoteState="no_change" refreshInterval={300000}/>
  </NextIntlClientProvider>);
  expect(screen.getByTestId('sync-timeline').textContent).toContain('本次刷新: 数据无变化');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('历史待审阅: 40');
});
