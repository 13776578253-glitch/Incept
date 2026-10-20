import { render, screen, within, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LanguageSettingsPanel } from '../language-settings-panel';
import { useLanguage } from '@/hooks/use-language';
import { DOCUMENT_LANGUAGE_COOKIE } from '@/features/docs/language/preference';

const mocks = vi.hoisted(() => ({ locale: 'zh', replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next-intl', () => ({ useLocale: () => mocks.locale }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  usePathname: () => `/${mocks.locale}/settings`, useSearchParams: () => new URLSearchParams('section=language') }));
beforeEach(() => { mocks.locale = 'zh'; vi.clearAllMocks(); document.cookie = `${DOCUMENT_LANGUAGE_COOKIE}=; Path=/; Max-Age=0`; });

it('shows a reading preferences card with two independent choices and persists document language without navigating', async () => {
  const user = userEvent.setup(); render(<LanguageSettingsPanel documentLanguage="zh" />);
  expect(screen.getByRole('heading', { name: '阅读偏好' })).toBeInTheDocument();
  await user.click(within(screen.getByRole('group', { name: '文档语言' })).getByRole('button', { name: 'English' }));
  expect(document.cookie).toContain(`${DOCUMENT_LANGUAGE_COOKIE}=en`);
  expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole('group', { name: '界面语言' })).getByRole('button', { name: '简体中文' })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps the original document language when switching the interface for the first time', () => {
  const { result } = renderHook(() => useLanguage());
  result.current.setLanguage('en');
  expect(document.cookie).toContain(`${DOCUMENT_LANGUAGE_COOKIE}=zh`);
  expect(mocks.replace).toHaveBeenCalledWith('/en/settings?section=language');
});

it('does not overwrite an explicitly chosen document language during an interface switch', () => {
  document.cookie = `${DOCUMENT_LANGUAGE_COOKIE}=zh; Path=/`;
  mocks.locale = 'en'; const { result } = renderHook(() => useLanguage());
  result.current.setLanguage('zh'); expect(document.cookie).toContain(`${DOCUMENT_LANGUAGE_COOKIE}=zh`);
});
