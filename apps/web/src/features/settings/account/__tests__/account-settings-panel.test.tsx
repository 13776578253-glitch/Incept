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
  expect(screen.getByText('共享访问码')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('输入共享访问码')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '启用访问' })).toBeInTheDocument();
});

it('renders live pro and owner views with logout capsule button', () => {
  const { rerender } = render(<AccountSettingsPanel language="zh" viewerRole="pro" />);
  expect(screen.getByText('临时访问已启用')).toBeInTheDocument();
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
