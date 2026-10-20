import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OwnerSecurityPanel } from '../owner-security-panel';
import type { OwnerManagementState } from '../account-types';

const state: OwnerManagementState = { username: 'owner', sessionId: 'session', recentAuthUntil: null,
  sessions: [], devices: [], challenges: [], permits: [], grants: [], audits: [] };

it('uses styled validation for empty, short and mismatched passwords, and submits exactly eight characters', async () => {
  const action = vi.fn().mockResolvedValue({});
  const user = userEvent.setup();
  render(<OwnerSecurityPanel state={state} language="zh" busy={false} action={action} onEnrollment={vi.fn()} onRecoveryCodes={vi.fn()} />);
  await user.click(screen.getAllByRole('button', { name: '管理' })[0]);
  const password = screen.getByLabelText('新密码（至少8个字符）');
  const confirmation = screen.getByLabelText('确认新密码');
  const submit = screen.getByRole('button', { name: '确认改密并退出' });
  expect(password.closest('form')).toHaveAttribute('novalidate');
  await user.click(submit);
  expect(screen.getByText('请填写新密码')).toHaveAttribute('role', 'alert');
  expect(screen.getByText('请再次填写新密码')).toHaveAttribute('role', 'alert');
  expect(password).toHaveFocus();
  await user.type(password, '1234567');
  await user.type(confirmation, 'different');
  await user.click(submit);
  expect(screen.getByText('新密码至少8个字符')).toBeInTheDocument();
  expect(screen.getByText('两次密码不一致')).toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
  await user.type(password, '8');
  await user.clear(confirmation);
  await user.type(confirmation, '12345678');
  await user.click(screen.getByRole('button', { name: '显示新密码' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(confirmation).toHaveAttribute('type', 'password');
  expect(action).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '隐藏新密码' }));
  await user.click(screen.getByRole('button', { name: '显示确认新密码' }));
  expect(confirmation).toHaveAttribute('type', 'text');
  await user.click(submit);
  expect(action).toHaveBeenCalledExactlyOnceWith('password', { password: '12345678' });
});

it('counts characters consistently with the server for non-BMP passwords', async () => {
  const action = vi.fn().mockResolvedValue({});
  const user = userEvent.setup();
  render(<OwnerSecurityPanel state={state} language="en" busy={false} action={action} onEnrollment={vi.fn()} onRecoveryCodes={vi.fn()} />);
  await user.click(screen.getAllByRole('button', { name: 'Manage' })[0]);
  await user.type(screen.getByLabelText('New password (8+ characters)'), '😀'.repeat(7));
  await user.type(screen.getByLabelText('Confirm new password'), '😀'.repeat(7));
  await user.click(screen.getByRole('button', { name: 'Change password and sign out' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters');
  expect(action).not.toHaveBeenCalled();
});
