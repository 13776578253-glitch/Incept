import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountSettingsPanel } from '../account-settings-panel';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ role: 'guest', configured: true, challenge: null }) }) as Response);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

it('renders live guest view with input and capsule submit button', () => {
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  expect(screen.getByText('Pro 访问码')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('输入共享访问码')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '启用访问' })).toBeInTheDocument();
});

it('renders live pro and owner views with logout capsule button', () => {
  const { rerender } = render(<AccountSettingsPanel language="zh" viewerRole="pro" />);
  expect(screen.getByText('Pro 阅读权限已启用')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '退出访问' })).toBeInTheDocument();

  rerender(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  expect(screen.getByText('站点所有者')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
});

it('shows styled error message when redeeming invalid code', async () => {
  vi.mocked(globalThis.fetch).mockImplementation(async url => url === '/api/access/shared-code/redeem' ? ({ status: 401 } as Response) : ({ ok: true, status: 200, json: async () => ({ role: 'guest', configured: true, challenge: null }) } as Response));

  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);

  await user.type(screen.getByPlaceholderText('输入共享访问码'), 'bad-code');
  await user.click(screen.getByRole('button', { name: '启用访问' }));

  expect(await screen.findByRole('status')).toHaveTextContent('访问码无效、已过期或已撤销');
});

it('paginates grant records and filters active grants', async () => {
  const futureExpiry = new Date(Date.now() + 86400000).toISOString();
  const grants = [
    {
      id: 'grant-1',
      label: '有效授权-1',
      mode: 'single' as const,
      codeHint: '000001',
      redeemExpiresAt: futureExpiry,
      expiresAt: futureExpiry,
      entitlementSeconds: null,
      maxRedemptions: 1,
      redeemedCount: 0,
      revokedAt: null,
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `grant-revoked-${index + 2}`,
      label: `已撤销授权-${index + 2}`,
      mode: 'shared' as const,
      codeHint: `00000${index + 2}`,
      redeemExpiresAt: futureExpiry,
      expiresAt: futureExpiry,
      entitlementSeconds: null,
      maxRedemptions: 10,
      redeemedCount: 0,
      revokedAt: '2026-11-20T00:00:00.000Z',
    })),
  ];

  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      role: 'owner',
      configured: true,
      challenge: null,
      management: {
        username: 'owner',
        sessionId: 'session-1',
        recentAuthUntil: null,
        sessions: [],
        devices: [],
        challenges: [],
        permits: [],
        grants,
        audits: [],
      },
    }),
  } as Response);

  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);

  expect(await screen.findByText('授权记录')).toBeInTheDocument();
  expect(screen.getByText('显示 5 / 7 条')).toBeInTheDocument();
  expect(screen.getByText('有效授权-1')).toBeInTheDocument();
  expect(screen.queryByText('已撤销授权-7')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '展开更多（剩余 2 条）' }));
  expect(screen.getByText('已撤销授权-7')).toBeInTheDocument();
  expect(screen.getByText('7 条记录')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '收起' }));
  expect(screen.getByText('显示 5 / 7 条')).toBeInTheDocument();
  expect(screen.queryByText('已撤销授权-7')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '仅看有效 (1)' }));
  expect(screen.getByText('1 条记录')).toBeInTheDocument();
  expect(screen.getByText('有效授权-1')).toBeInTheDocument();
  expect(screen.queryByText('已撤销授权-2')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '显示全部 (7)' }));
  expect(screen.getByText('显示 5 / 7 条')).toBeInTheDocument();
  expect(screen.getByText('已撤销授权-2')).toBeInTheDocument();
});
