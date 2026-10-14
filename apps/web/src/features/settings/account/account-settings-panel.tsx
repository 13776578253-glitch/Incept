'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OwnerAccountPanel } from './owner-account-panel';

// pro：显示临时访问并可退出。
// owner：显示 Owner 状态并可退出。
// Owner secret 仍没有放入设置页，仍只能调用原有 Owner API
// 2026-10-14：普通 Owner 登录已迁移为密码 + TOTP + 风险授权，旧 secret 登录入口停用。

type AccountViewerRole = 'guest' | 'pro' | 'owner';

function getCopy(language: 'zh' | 'en', viewerRole: AccountViewerRole) {
  if (language === 'zh') {
    if (viewerRole === 'owner') {
      return {
        title: '站点所有者',
        description: '当前浏览器拥有内部管理与全部阅读权限',
        action: '退出登录',
      };
    }

    if (viewerRole === 'pro') {
      return {
        title: '临时访问已启用',
        description: '当前浏览器可阅读 guest 与 pro 内容',
        action: '退出访问',
      };
    }

    return {
      title: '共享访问码',
      description: '输入有效访问码后，此浏览器可阅读 pro 内容',
      placeholder: '输入共享访问码',
      action: '启用访问',
      invalid: '访问码无效、已过期或已撤销',
      unavailable: '暂时无法启用访问，请稍后重试',
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

function LiveAccountSettingsPanel({
  language,
  viewerRole,
  hideHeader = false,
}: {
  language: 'zh' | 'en';
  viewerRole: AccountViewerRole;
  hideHeader?: boolean;
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
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      router.refresh();
    } catch {
      setError(language === 'zh' ? '退出未完成，请重试。' : 'Sign-out was not completed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const roleBadgeStyle =
    viewerRole === 'owner'
      ? {
          label: 'OWNER',
          fg: 'var(--badge-indigo-fg)',
          bg: 'var(--badge-indigo-bg)',
          border: 'var(--badge-indigo-border)',
          dot: 'var(--badge-indigo-dot)',
        }
      : viewerRole === 'pro'
        ? {
            label: 'PRO',
            fg: 'var(--badge-sky-fg)',
            bg: 'var(--badge-sky-bg)',
            border: 'var(--badge-sky-border)',
            dot: 'var(--badge-sky-dot)',
          }
        : {
            label: 'GUEST',
            fg: 'var(--badge-amber-fg)',
            bg: 'var(--badge-amber-bg)',
            border: 'var(--badge-amber-border)',
            dot: 'var(--badge-amber-dot)',
          };

  return (
    <section id="account" className="max-w-[760px] space-y-6">
      {!hideHeader && (
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
              {language === 'zh' ? '账户' : 'Account'}
            </h2>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium tracking-[0.06em]"
              style={{
                color: roleBadgeStyle.fg,
                backgroundColor: roleBadgeStyle.bg,
                borderColor: roleBadgeStyle.border,
              }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: roleBadgeStyle.dot }}
              />
              <span>{roleBadgeStyle.label}</span>
            </span>
          </div>
          <p className="max-w-3xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
            {language === 'zh' ? '身份与受控访问' : 'Identity and controlled access.'}
          </p>
        </header>
      )}

      <div className="rounded-2xl bg-[color:var(--color-row-bg)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
                {copy.title}
              </h3>
              {hideHeader && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium tracking-[0.06em]"
                  style={{
                    color: roleBadgeStyle.fg,
                    backgroundColor: roleBadgeStyle.bg,
                    borderColor: roleBadgeStyle.border,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: roleBadgeStyle.dot }}
                  />
                  <span>{roleBadgeStyle.label}</span>
                </span>
              )}
            </div>
            <p className="max-w-2xl text-[0.8125rem] leading-6 text-[var(--color-nav-dropdown-description)]">
              {copy.description}
            </p>
          </div>
        </div>

        {viewerRole === 'guest' ? (
          <form onSubmit={handleSharedCodeSubmit} className="flex flex-wrap items-center gap-2.5 pt-1 sm:flex-nowrap sm:max-w-[480px]">
            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={copy.placeholder}
              disabled={isSubmitting}
              className="min-h-10 w-full min-w-0 flex-1 rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] px-5 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (language === 'zh' ? '处理中…' : 'Processing…') : copy.action}
            </button>
          </form>
        ) : (
          <div className="pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--color-bg)] px-5 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (language === 'zh' ? '处理中…' : 'Processing…') : copy.action}
            </button>
          </div>
        )}

        {error ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--badge-rose-fg)]"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-[var(--badge-rose-dot)]"
            />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function AccountSettingsPanel({
  language,
  viewerRole,
}: {
  language: 'zh' | 'en';
  viewerRole: AccountViewerRole;
}) {
  return (
    <div className="max-w-[760px] space-y-6">
      <OwnerAccountPanel language={language} viewerRole={viewerRole} />
        <div className="pt-4">
          <LiveAccountSettingsPanel language={language} viewerRole={viewerRole} hideHeader />
        </div>
    </div>
  );
}
