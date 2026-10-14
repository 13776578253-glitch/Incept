import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountSettingsPanel } from '../account-settings-panel';

const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace }), useSearchParams: () => new URLSearchParams() }));
afterEach(() => { vi.restoreAllMocks(); refresh.mockClear(); replace.mockClear(); });
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const guest = { role: 'guest', configured: true, challenge: null };
const ownerState = { ...guest, role: 'owner', management: { username: 'owner', sessionId: 'owner-session', recentUntil: new Date(Date.now() + 300000).toISOString(), sessions: [], devices: [], challenges: [], permits: [], grants: [], audits: [] } };

it('submits credentials and advances only after the server establishes a TOTP challenge', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(guest)).mockResolvedValueOnce(response({ stage: 'totp', expiresAt: new Date(Date.now() + 300000).toISOString() }));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await waitFor(() => expect(screen.queryByText('正在读取账户状态…')).not.toBeInTheDocument());
  expect(screen.queryByText('Owner 账户')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '生成授权码' })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('用户名'), 'owner');
  await user.type(screen.getByLabelText('密码'), 'a-real-form-password');
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(fetch).toHaveBeenLastCalledWith('/api/auth/owner/login', expect.objectContaining({ body: JSON.stringify({ username: 'owner', password: 'a-real-form-password' }) }));
  expect(await screen.findByLabelText('TOTP 动态码')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('a-real-form-password')).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('keeps the password stage after rejected credentials and exposes a generic failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(guest)).mockResolvedValueOnce(response({ error: 'invalid_credentials' }, 401));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await waitFor(() => expect(screen.queryByText('正在读取账户状态…')).not.toBeInTheDocument());
  await user.type(screen.getByLabelText('用户名'), 'owner'); await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('账号、密码或验证码不正确');
  expect(screen.queryByLabelText('TOTP 动态码')).not.toBeInTheDocument();
});

it('does not report logout success when the server rejects it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ ...guest, role: 'owner' })).mockResolvedValueOnce(response({}, 503));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  await waitFor(() => expect(screen.queryByText('正在读取账户状态…')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByText('退出未完成，请重试。')).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('sends an explicit permanent invitation lifetime without a separate redemption window', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/auth/owner/grant' ? { code: 'PRO-test-invitation' } : ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  const lifetime = await screen.findByLabelText('有效时间');
  expect(lifetime).toHaveValue('7');
  expect(screen.queryByLabelText('可兑换窗口')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('兑换后的阅读期限')).not.toBeInTheDocument();
  await user.selectOptions(lifetime, 'permanent');
  await user.click(screen.getByRole('button', { name: '生成授权码' }));
  expect(fetch).toHaveBeenCalledWith('/api/auth/owner/grant', expect.objectContaining({ body: JSON.stringify({ kind: 'single', label: '', lifetimeDays: null }) }));
  expect(await screen.findByText('PRO-test-invitation')).toBeInTheDocument();
});

it('uses six-hour group sharing by default and sends explicit hours', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/auth/owner/grant' ? { code: 'PRO-test-sharing' } : ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="en" viewerRole="owner" />);
  await screen.findByLabelText('Lifetime');
  await user.click(screen.getByRole('button', { name: /Group sharing/ }));
  expect(screen.getByLabelText('Lifetime')).toHaveValue('6');
  expect(screen.getByRole('option', { name: '24 hours' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Permanent/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Generate access code' }));
  expect(fetch).toHaveBeenCalledWith('/api/auth/owner/grant', expect.objectContaining({ body: JSON.stringify({ kind: 'shared', label: '', lifetimeHours: 6, limit: 10 }) }));
});
