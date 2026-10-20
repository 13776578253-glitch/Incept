import { act, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LOGIN_STEP_ANIMATION_MS, OwnerLoginCompletion } from '../owner-login-completion';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('walks all three fixed steps after a password-only login, then displays success', () => {
  vi.useFakeTimers();
  render(<OwnerLoginCompletion language="zh" fromStep={0} />);
  expect(screen.getByText('第 1 / 3 步')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: '登录步骤' })).getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('正在完成登录…')).toBeInTheDocument();
  expect(screen.queryByText('登录成功')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('第 2 / 3 步')).toBeInTheDocument();
  expect(screen.getAllByText('已完成')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('第 3 / 3 步')).toBeInTheDocument();
  expect(screen.getAllByText('已完成')).toHaveLength(2);
  expect(screen.queryByText('登录成功')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('登录成功')).toBeInTheDocument();
  expect(screen.getAllByText('已验证')).toHaveLength(1);
});

it('finishes the approval step after TOTP without replaying the password step', () => {
  vi.useFakeTimers();
  render(<OwnerLoginCompletion language="en" fromStep={1} />);
  expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  expect(screen.getAllByText('Verified')).toHaveLength(2);
  expect(screen.getByText('Completed')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('Signed in')).toBeInTheDocument();
});

it('keeps the third-step indicator when independent approval has been completed', () => {
  vi.useFakeTimers();
  render(<OwnerLoginCompletion language="zh" fromStep={2} />);
  expect(screen.getByText('第 3 / 3 步')).toBeInTheDocument();
  expect(screen.queryByText('已完成')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(LOGIN_STEP_ANIMATION_MS));
  expect(screen.getByText('登录成功')).toBeInTheDocument();
  expect(screen.getAllByText('已验证')).toHaveLength(3);
});

it('finishes without animation delays when reduced motion is requested', () => {
  vi.useFakeTimers();
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: query === '(prefers-reduced-motion: reduce)' }));
  render(<OwnerLoginCompletion language="zh" fromStep={0} />);
  act(() => vi.advanceTimersByTime(0));
  expect(screen.getByText('第 3 / 3 步')).toBeInTheDocument();
  expect(screen.getByText('登录成功')).toBeInTheDocument();
});

it('cancels all animation timers on unmount', () => {
  vi.useFakeTimers();
  const view = render(<OwnerLoginCompletion language="zh" fromStep={0} />);
  expect(vi.getTimerCount()).toBe(3);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
