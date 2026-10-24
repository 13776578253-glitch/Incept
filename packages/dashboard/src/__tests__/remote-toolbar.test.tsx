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
  expect(screen.getByTestId('sync-timeline').textContent).toContain('采集 ');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('提交 ');
  expect(screen.getByTestId('sync-timeline').textContent).not.toContain('Dashboard');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('刷新 正在上传');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('待审阅 40');
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
  expect(screen.getByTestId('sync-timeline').textContent).toContain('刷新 数据无变化');
  expect(screen.getByTestId('sync-timeline').textContent).toContain('待审阅 40');
});
it('hides the registered device name while a single device is bound',()=>{
  render(<NextIntlClientProvider locale="zh" messages={{dashboard:zh}}><DashboardToolbar
    rangePreset="7d" setRangePreset={()=>{}} setSelectedTrendIndex={()=>{}} data={emptyDashboard('7d')}
    isRefreshing={false} refreshError={false} onRefresh={()=>{}} refreshCycle={1} isPollingPaused={false}
    remoteInfo={{remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[{id:'only',name:'Phase 5 canary Windows',online:true}]}}
    remoteDevice="only" setRemoteDevice={()=>{}} remoteState="idle" refreshInterval={300000}/>
  </NextIntlClientProvider>);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(document.body.textContent).toContain('同步设备 · 设备在线');
  expect(document.body.textContent).not.toContain('Phase 5');
});
it('lists every bound device by name once more than one exists',()=>{
  render(<NextIntlClientProvider locale="zh" messages={{dashboard:zh}}><DashboardToolbar
    rangePreset="7d" setRangePreset={()=>{}} setSelectedTrendIndex={()=>{}} data={emptyDashboard('7d')}
    isRefreshing={false} refreshError={false} onRefresh={()=>{}} refreshCycle={1} isPollingPaused={false}
    remoteInfo={{remoteEnabled:true,readMode:'v2',intervalMs:300000,devices:[
      {id:'a',name:'台式机',online:true},{id:'b',name:'笔记本',online:false}]}}
    remoteDevice="a" setRemoteDevice={()=>{}} remoteState="idle" refreshInterval={300000}/>
  </NextIntlClientProvider>);
  const select=screen.getByRole('combobox');
  expect(select.textContent).toContain('台式机 · 设备在线');
  expect(select.textContent).toContain('笔记本 · 设备离线');
});
