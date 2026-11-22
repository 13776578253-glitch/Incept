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
        title: 'Pro 阅读权限已启用',
        description: '当前浏览器可阅读 guest 与 pro 内容',
        action: '退出访问',
      };
    }

    return {
      title: 'Pro 访问码',
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
      description: 'This browser can manage internal tools and read all content',
      action: 'Sign out',
    };
  }

  if (viewerRole === 'pro') {
    return {
      title: 'Pro reading access enabled',
      description: 'This browser can read guest and pro content',
      action: 'End access',
    };
  }

  return {
    title: 'Pro access code',
    description: 'Enter a valid code to read pro content in this browser',
    placeholder: 'Enter shared access code',
    action: 'Enable access',
    invalid: 'The access code is invalid, expired, or revoked',
    unavailable: 'Access could not be enabled. Please try again later',
  };
}

function LiveAccountSettingsPanel({
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
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      router.refresh();
    } catch {
      setError(language === 'zh' ? '退出未完成，请重试' : 'Sign-out was not completed. Please try again');
    } finally {
      setIsSubmitting(false);
    }
  }

  const roleMeta =
    viewerRole === 'owner'
      ? { label: 'OWNER', dot: 'var(--badge-emerald-dot)' }
      : viewerRole === 'pro'
        ? { label: 'PRO', dot: 'var(--badge-sky-dot)' }
        : { label: 'GUEST', dot: 'var(--color-text-soft)' };

  return (
    <div
      id={viewerRole === 'guest' ? 'account-pro-code' : undefined}
      className="border-y border-[var(--color-border-faint)] py-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[length:var(--text-base)] font-medium text-[var(--color-text)]">
              {copy.title}
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--text-2xs)] font-medium tracking-[0.06em] text-[var(--color-text-muted)]">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: roleMeta.dot }}
              />
              <span>{roleMeta.label}</span>
            </span>
          </div>
          <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
            {copy.description}
          </p>
        </div>

        {viewerRole !== 'guest' ? (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleLogout}
            className="inline-flex min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-card,var(--color-bg))] px-3.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (language === 'zh' ? '处理中…' : 'Processing…') : copy.action}
          </button>
        ) : null}
      </div>

      {viewerRole === 'guest' ? (
        <form onSubmit={handleSharedCodeSubmit} className="flex flex-wrap items-center gap-2.5 pt-0.5 sm:flex-nowrap sm:max-w-[480px]">
          <div className="relative flex-1 min-w-0">
            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={copy.placeholder}
              disabled={isSubmitting}
              className="min-h-9 w-full rounded-[9px] border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-sm)] text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-ring-focus)]"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary-bg)] px-4 text-[length:var(--text-xs)] font-medium text-[color:var(--color-primary-fg)] transition-all hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (language === 'zh' ? '处理中…' : 'Processing…') : copy.action}
          </button>
        </form>
      ) : null}

      {error ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[10px] border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3.5 py-2.5 text-[length:var(--text-sm)] text-[var(--badge-rose-fg)]"
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-[var(--badge-rose-dot)]"
          />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
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
    <section
      id="account"
      aria-label={language === 'zh' ? '账户与访问' : 'Account and access'}
      className="max-w-[760px] space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
          {language === 'zh' ? '账户与访问' : 'Account & access'}
        </h2>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
          {language === 'zh'
            ? '管理当前浏览器访问身份、Owner 安全凭据与受控授权'
            : 'Manage browser access role, Owner security, and invitations'}
        </p>
      </header>

      <LiveAccountSettingsPanel language={language} viewerRole={viewerRole} />
      <OwnerAccountPanel language={language} viewerRole={viewerRole} hideHeader />
    </section>
  );
}
