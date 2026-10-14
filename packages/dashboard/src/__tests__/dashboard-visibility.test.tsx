// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import zh from '../messages/zh.json';
import { emptyDashboard } from '../domain';
import { ProjectsSection } from '../react/sections/projects/projects-section';
import { TokenDashboardFeature } from '../react/token-dashboard-feature';

afterEach(cleanup);

function withMessages(children: React.ReactNode) {
  return <NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>{children}</NextIntlClientProvider>;
}

it('Guest sees all navigation and statistical sections plus three permission placeholders in section 04', async () => {
  render(withMessages(<TokenDashboardFeature data={emptyDashboard()} />));
  for (const name of ['01 概览', '02 模型', '03 费用', '04 项目与会话']) {
    expect(screen.getByRole('link', { name })).toBeDefined();
  }
  expect(await screen.findByRole('heading', { name: zh.models.title })).toBeDefined();
  expect(await screen.findByRole('heading', { name: zh.costs.title })).toBeDefined();
  expect(await screen.findByRole('heading', { name: zh.projects.title })).toBeDefined();
  expect(await screen.findAllByText('无权限查看')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
});

it('restricted project panels never render private records or interactive data controls', () => {
  const data = emptyDashboard();
  data.projects = [{ ...data.totals, projectKey: 'private-key', projectName: 'Private project', workspacePath: 'private-path',
    modelsUsed: [], shareOfTokens: 1, shareOfCost: 1, lastActivity: '2026-10-14' }];
  render(withMessages(<ProjectsSection data={data} canViewDetails={false} />));
  expect(screen.getAllByText('无权限查看')).toHaveLength(3);
  expect(screen.queryByText('Private project')).toBeNull();
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});

it('Pro sees section 04 records while import remains Owner-only', async () => {
  const data = emptyDashboard();
  data.projects = [{ ...data.totals, projectKey: 'readable-key', projectName: 'Readable project',
    modelsUsed: [], shareOfTokens: 1, shareOfCost: 1, lastActivity: '2026-10-14' }];
  render(withMessages(<TokenDashboardFeature data={data} canViewDetails />));
  expect(await screen.findByText('Readable project')).toBeDefined();
  expect(screen.queryByText('无权限查看')).toBeNull();
  expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
});
