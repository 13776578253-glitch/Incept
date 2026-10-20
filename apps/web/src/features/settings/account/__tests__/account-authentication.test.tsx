import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  await user.click(screen.getByRole('button', { name: '登录' }));
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
  await user.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('账号、密码或验证码不正确');
  expect(screen.queryByLabelText('TOTP 动态码')).not.toBeInTheDocument();
});

it('does not report logout success when the server rejects it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ ...guest, role: 'owner' })).mockResolvedValueOnce(response({}, 503));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  await waitFor(() => expect(screen.queryByText('正在读取账户状态…')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByText('退出未完成，请重试')).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('walks fixed three-step completion after server-confirmed password-only login before switching to management', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(guest))
    .mockResolvedValueOnce(response({ stage: 'complete' })).mockResolvedValue(response(ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await screen.findByLabelText('用户名');
  expect(screen.getByText('第 1 / 3 步')).toBeInTheDocument();
  await user.type(screen.getByLabelText('用户名'), 'owner'); await user.type(screen.getByLabelText('密码'), 'known-device-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByText('正在完成登录…')).toBeInTheDocument();
  expect(screen.queryByLabelText('TOTP 动态码')).not.toBeInTheDocument();
  expect(screen.queryByText('Owner 账户')).not.toBeInTheDocument();
  expect(await screen.findByText('第 2 / 3 步')).toBeInTheDocument();
  expect(await screen.findByText('第 3 / 3 步')).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
  expect(await screen.findByText('登录成功', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(await screen.findByText('Owner 账户', {}, { timeout: 2000 })).toBeInTheDocument();
  expect(screen.queryByText('登录成功')).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('does not claim success while a high-risk login is still waiting for TOTP and independent approval', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(guest))
    .mockResolvedValueOnce(response({ stage: 'totp', needsApproval: true, expiresAt: new Date(Date.now() + 300000).toISOString() }))
    .mockResolvedValueOnce(response({ stage: 'approval', needsApproval: true, challengeId: 'pending', expiresAt: new Date(Date.now() + 600000).toISOString() }));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await screen.findByLabelText('用户名');
  await user.type(screen.getByLabelText('用户名'), 'owner'); await user.type(screen.getByLabelText('密码'), 'high-risk-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  await user.type(await screen.findByLabelText('TOTP 动态码'), '123456');
  expect(screen.getByText('第 2 / 3 步')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(await screen.findByLabelText('Owner 一次性授权码')).toBeInTheDocument();
  expect(screen.getByText('第 3 / 3 步')).toBeInTheDocument();
  expect(screen.queryByText('登录成功')).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('opens management without replaying a success animation for an existing Owner session', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(ownerState));
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  expect(await screen.findByText('Owner 账户')).toBeInTheDocument();
  expect(screen.queryByText('登录成功')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('uses static immediate success when reduced motion is requested', async () => {
  const originalMatchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation(query => query === '(prefers-reduced-motion: reduce)'
    ? { ...originalMatchMedia(query), matches: true } : originalMatchMedia(query));
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(guest))
    .mockResolvedValueOnce(response({ stage: 'complete' })).mockResolvedValue(response(ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await screen.findByLabelText('用户名');
  await user.type(screen.getByLabelText('用户名'), 'owner'); await user.type(screen.getByLabelText('密码'), 'known-device-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByText('Owner 账户')).toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(1);
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

function mockModal() {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
}

it('opens identity verification as a modal and clears input on Escape while restoring focus', async () => {
  mockModal();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  const trigger = await screen.findByRole('button', { name: '验证身份' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: '确认敏感操作' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(within(dialog).getByLabelText('当前密码')).toHaveFocus();
  await user.type(within(dialog).getByLabelText('当前密码'), 'unsent-password');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(within(screen.getByRole('dialog')).getByLabelText('当前密码')).toHaveValue('');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
});

it('keeps authentication errors inside the modal and resumes the original operation only after success', async () => {
  mockModal();
  let grantCalls = 0, verificationCalls = 0;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === '/api/auth/owner/grant') return ++grantCalls === 1 ? response({ error: 'reauthentication_required' }, 428) : response({ code: 'PRO-verified-grant' });
    if (url === '/api/auth/owner/reauthenticate') return ++verificationCalls === 1 ? response({ error: 'invalid_credentials' }, 401) : response({ authenticated: true });
    return response(ownerState);
  });
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  await screen.findByLabelText('有效时间');
  await user.click(screen.getByRole('button', { name: '生成授权码' }));
  let dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('当前密码'), 'password-for-verification');
  await user.type(within(dialog).getByLabelText('当前 TOTP'), '123456');
  await user.click(within(dialog).getByRole('button', { name: '验证并继续' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('账号、密码或验证码不正确');
  expect(grantCalls).toBe(1);
  dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('当前密码'), 'password-for-verification');
  await user.type(within(dialog).getByLabelText('当前 TOTP'), '654321');
  await user.click(within(dialog).getByRole('button', { name: '验证并继续' }));
  expect(await screen.findByText('PRO-verified-grant')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/auth/owner/grant', expect.objectContaining({ body: JSON.stringify({ kind: 'single', label: '', lifetimeDays: 7 }) }));
  expect(grantCalls).toBe(2);
});

it('toggles the login password without submitting and renders missing-input errors in the page', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(guest));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  const password = await screen.findByLabelText('密码');
  expect(password.closest('form')).toHaveAttribute('novalidate');
  await user.click(screen.getByRole('button', { name: '登录' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请填写用户名');
  await user.type(password, 'unsent-password');
  await user.click(screen.getByRole('button', { name: '显示密码' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: '隐藏密码' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: '隐藏密码' }));
  expect(password).toHaveAttribute('type', 'password');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('uses custom validation and a password toggle inside identity verification', async () => {
  mockModal();
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(ownerState));
  const user = userEvent.setup();
  render(<AccountSettingsPanel language="zh" viewerRole="owner" />);
  await user.click(await screen.findByRole('button', { name: '验证身份' }));
  const dialog = within(screen.getByRole('dialog', { name: '确认敏感操作' }));
  await user.click(dialog.getByRole('button', { name: '验证并继续' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('请填写密码');
  const password = dialog.getByLabelText('当前密码');
  await user.type(password, 'unsent-password');
  await user.click(dialog.getByRole('button', { name: '显示当前密码' }));
  expect(password).toHaveAttribute('type', 'text');
  await user.type(dialog.getByLabelText('当前 TOTP'), '123');
  await user.click(dialog.getByRole('button', { name: '验证并继续' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('请填写6位动态码');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows newly issued recovery codes in a modal, copies them, and continues only after explicit dismissal', async () => {
  mockModal();
  const codes = Array.from({ length: 8 }, (_, index) => `REC-isolated-test-${index}`);
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ ...guest, challenge: {
    stage: 'enroll', secret: 'A'.repeat(32), username: 'owner', expiresAt: new Date(Date.now() + 300000).toISOString(),
  } })).mockResolvedValueOnce(response({ stage: 'complete', recoveryCodes: codes })).mockResolvedValue(response(ownerState));
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<AccountSettingsPanel language="zh" viewerRole="guest" />);
  await user.type(await screen.findByLabelText('TOTP 动态码'), '123456');
  await user.click(screen.getByRole('button', { name: '完成登录' }));
  const dialog = await screen.findByRole('dialog', { name: '保存恢复码' });
  for (const code of codes) expect(within(dialog).getByText(code)).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  expect(within(dialog).getByRole('button', { name: '已保存，继续' })).toHaveFocus();
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(dialog).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: '复制全部' }));
  expect(copy).toHaveBeenCalledWith(codes.join('\n'));
  expect(within(dialog).getByRole('button', { name: '已复制' })).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '已保存，继续' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText(codes[0])).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
  expect(refresh).toHaveBeenCalledTimes(1);
});
