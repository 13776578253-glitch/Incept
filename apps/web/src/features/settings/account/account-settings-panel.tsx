'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

// pro：显示临时访问并可退出。
// owner：显示 Owner 状态并可退出。
// Owner secret 仍没有放入设置页，仍只能调用原有 Owner API

//
type AccountViewerRole = 'guest' | 'pro' | 'owner';

function getCopy(language: 'zh' | 'en', viewerRole: AccountViewerRole) {
  if (language === 'zh') {
    if (viewerRole === 'owner') {
      return {
        title: '站点所有者',
        description: '当前浏览器拥有内部管理与全部阅读权限。',
        action: '退出登录',
      };
    }

    if (viewerRole === 'pro') {
      return {
        title: '临时访问已启用',
        description: '当前浏览器可阅读 guest 与 pro 内容。',
        action: '退出访问',
      };
    }

    return {
      title: '共享访问码',
      description: '输入有效访问码后，此浏览器可阅读 pro 内容。',
      placeholder: '输入共享访问码',
      action: '启用访问',
      invalid: '访问码无效、已过期或已撤销。',
      unavailable: '暂时无法启用访问，请稍后重试。',
    };
  }

  if (viewerRole === 'owner') {
    return {
      title: 'Site owner',
      description: 'This browser can manage internal tools and read all content.',
      action: 'Sign out',
    };
  }

  if (viewerRole === 'pro') {
    return {
      title: 'Temporary access enabled',
      description: 'This browser can read guest and pro content.',
      action: 'End access',
    };
  }

  return {
    title: 'Shared access code',
    description: 'Enter a valid code to read pro content in this browser.',
    placeholder: 'Enter shared access code',
    action: 'Enable access',
    invalid: 'The access code is invalid, expired, or revoked.',
    unavailable: 'Access could not be enabled. Please try again later.',
  };
}

export function AccountSettingsPanel({
  language,
  viewerRole,
}: {
  language: 'zh' | 'en';
  viewerRole: AccountViewerRole;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = getCopy(language, viewerRole);

  async function handleSharedCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/access/shared-code/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (response.status === 204) {
        router.refresh();
        return;
      }

      setError(response.status === 401 ? copy.invalid ?? null : copy.unavailable ?? null);
    } catch {
      setError(copy.unavailable ?? null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section id="account" className="space-y-3">
      <header className="space-y-1.5">
        <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
          {language === 'zh' ? '账户' : 'Account'}
        </h2>
        <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {language === 'zh' ? '身份与受控访问。' : 'Identity and controlled access.'}
        </p>
      </header>

      <div className="max-w-[760px] py-5">
        <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
          {copy.title}
        </h3>
        <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
          {copy.description}
        </p>

        {viewerRole === 'guest' ? (
          <form onSubmit={handleSharedCodeSubmit} className="mt-4 flex w-full max-w-[460px] gap-3">
            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={copy.placeholder}
              disabled={isSubmitting}
              className="min-h-10 min-w-0 flex-1 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none placeholder:text-[var(--color-nav-muted)] focus:border-[var(--color-nav-search-hover-border)]"
            />
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="min-h-10 shrink-0 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.action}
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleLogout}
            className="mt-4 min-h-10 rounded-[12px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] transition-colors hover:bg-[var(--color-nav-item-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.action}
          </button>
        )}

        {error ? (
          <p className="mt-3 text-[0.75rem] leading-5 text-[var(--color-nav-dropdown-description)]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
