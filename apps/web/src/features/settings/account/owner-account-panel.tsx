'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OwnerSecurityPanel } from './owner-security-panel';
import { SyncDevicesPanel } from './sync-devices-panel';
import { CustomSelect } from './custom-select';
import { PasswordInput } from './password-input';
import { RecoveryCodesDialog } from './recovery-codes-dialog';
import { OwnerLoginCompletion, LOGIN_STEP_ANIMATION_MS, LOGIN_SUCCESS_HOLD_MS } from './owner-login-completion';
import type { OwnerAccountState, OwnerChallengeState } from './account-types';

const fieldStyle =
  'min-h-10 w-full min-w-0 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)] focus:outline-none';
const reauthFieldStyle =
  'min-h-11 w-full min-w-0 rounded-[7px] border border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-lane-bg)]/45 px-3 text-[0.84rem] text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-nav-muted)] focus:border-[#3b82f6] focus:bg-[var(--roadmap-card-bg,var(--color-bg))] focus:ring-2 focus:ring-[#3b82f6]/12';
const buttonBase =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[0.8125rem] font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
const primaryStyle = `${buttonBase} border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)] hover:bg-[color:var(--color-row-hover-bg)]`;
const secondaryStyle = `${buttonBase} text-[var(--color-nav-dropdown-description)] hover:bg-[color:var(--color-row-hover-bg)] hover:text-[var(--color-text)]`;

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[0.8125rem] font-medium text-[var(--color-text)]">
        {label}
      </label>
      {children}
    </div>
  );
}

// The server owns authentication state; form fields only hold the current, unsent input.
export function OwnerAccountPanel({
  language,
  viewerRole,
  hideHeader = false,
}: {
  language: 'zh' | 'en';
  viewerRole: 'guest' | 'pro' | 'owner';
  hideHeader?: boolean;
}) {
  const prefix = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const [state, setState] = useState<OwnerAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const reauthForm = useRef<HTMLFormElement>(null);
  const reauthDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [signInComplete, setSignInComplete] = useState(false);
  const [completionFrom, setCompletionFrom] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [trustDevice, setTrustDevice] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pending, setPending] = useState<{ action: string; body: Record<string, unknown> } | null>(null);
  const needsReauth = pending !== null;
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthCode, setReauthCode] = useState('');
  const [confirmGrant, setConfirmGrant] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [riskCode, setRiskCode] = useState('');
  const [kind, setKind] = useState<'single' | 'shared'>('single');
  const [label, setLabel] = useState('');
  const [lifetimeDays, setLifetimeDays] = useState('7');
  const [lifetimeHours, setLifetimeHours] = useState('6');
  const [limit, setLimit] = useState('10');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuedApproval, setIssuedApproval] = useState<string | null>(null);
  const challenge = state?.challenge;
  const stage = challenge?.stage ?? 'credentials';
  const enrolling = stage === 'setup' || stage === 'enroll';
  const step = stage === 'credentials' ? 0 : stage === 'totp' || stage === 'setup' ? 1 : 2;
  const role = state?.role ?? viewerRole;
  const grants = (state?.management?.grants ?? []).map(grant => ({ ...grant, kind: grant.mode ?? 'shared', revoked: !!grant.revokedAt }));
  const inputId = (name: string) => `${prefix}-${name}`;
  const steps = enrolling ? [t('账号密码', 'Credentials'), t('初始化授权', 'Setup approval'), t('绑定验证器', 'Enroll authenticator')]
    : [t('账号密码', 'Credentials'), 'TOTP', t('授权确认', 'Approval')];
  const summary =
    kind === 'single'
      ? lifetimeDays === 'permanent'
        ? t('点对点邀请，仅可兑换一次；邀请码与阅读权限永久有效，直到手动撤销', 'A point-to-point invitation, redeemable once; the invitation and reading access remain valid until manually revoked')
        : t(`签发后 ${lifetimeDays} 天统一到期，仅可兑换一次；邀请码与已兑换阅读权限在同一时间结束`, `Expires ${lifetimeDays} days after issuance, redeemable once; the invitation and redeemed reading access share the same deadline`)
      : t(
          `签发后 ${lifetimeHours} 小时统一到期，最多 ${limit} 个浏览器凭据；适合团队或公开分享，所有已兑换权限同时结束`,
          `Expires ${lifetimeHours} hours after issuance, for up to ${limit} browser credentials; suited to team or public sharing, with all redeemed access ending together`,
        );

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/owner/state', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('service_unavailable');
      const data = await response.json() as OwnerAccountState;
      if (!controller.signal.aborted) { setState(data); setCheckedAt(Date.now()); setError(null); setIssuedCode(null); setPending(null); }
      if (!controller.signal.aborted && data.role !== 'owner') { setRecoveryCodes([]); setIssuedApproval(null); }
    }).catch(() => { if (!controller.signal.aborted) setError('service_unavailable'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [viewerRole]);

  useEffect(() => {
    const controller = new AbortController();
    const viewport = window.matchMedia('(min-width: 1024px)');
    const refreshVisibleState = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/auth/owner/state', { cache: 'no-store', signal: controller.signal }).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as OwnerAccountState;
        if (controller.signal.aborted) return;
        setState(data); setCheckedAt(Date.now());
        if (data.role !== 'owner') { setRecoveryCodes([]); setIssuedApproval(null); setIssuedCode(null); setPending(null); }
      }).catch(() => {});
    };
    viewport.addEventListener('change', refreshVisibleState);
    window.addEventListener('focus', refreshVisibleState);
    document.addEventListener('visibilitychange', refreshVisibleState);
    return () => { controller.abort(); viewport.removeEventListener('change', refreshVisibleState); window.removeEventListener('focus', refreshVisibleState); document.removeEventListener('visibilitychange', refreshVisibleState); };
  }, []);

  useEffect(() => {
    if (!needsReauth) return;
    const dialog = reauthDialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    reauthForm.current?.querySelector('input')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [needsReauth]);

  async function reloadState() {
    const response = await fetch('/api/auth/owner/state', { cache: 'no-store' });
    if (!response.ok) { setError('service_unavailable'); return; }
    setState(await response.json() as OwnerAccountState);
    setCheckedAt(Date.now());
  }

  const finishSignIn = useCallback(() => {
    const requested = searchParams.get('returnTo');
    if (requested?.startsWith('/') && !requested.startsWith('//') && !/[\\\u0000-\u001f]/.test(requested)) {
      const destination = new URL(requested, window.location.origin);
      if (destination.origin === window.location.origin && /^\/(?:zh|en)(?:\/(?:docs|roadmap|dashboard|about|settings)(?:\/|$)|\/?$)/.test(destination.pathname)) {
        router.replace(destination.pathname + destination.search + destination.hash);
      }
    }
    router.refresh();
  }, [router, searchParams]);

  useEffect(() => {
    if (!signInComplete) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/auth/owner/state', { cache: 'no-store', signal: controller.signal });
        if (response.ok && !controller.signal.aborted) { setState(await response.json() as OwnerAccountState); setCheckedAt(Date.now()); }
      } catch { /* The completed server session remains valid if the management refresh is interrupted. */ }
      if (!controller.signal.aborted) { setSignInComplete(false); finishSignIn(); }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (3 - completionFrom) * LOGIN_STEP_ANIMATION_MS + LOGIN_SUCCESS_HOLD_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [signInComplete, completionFrom, finishSignIn]);

  async function action(name: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/auth/owner/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        if (response.status === 428) setPending({ action: name, body });
        setError(typeof result.error === 'string' ? result.error : 'service_unavailable');
        return null;
      }
      if (name === 'login' || name === 'verify' || name === 'totp') {
        setPassword(''); setOtp(''); setRiskCode('');
        if (result.stage && result.stage !== 'complete') setState(current => current ? { ...current, challenge: result as OwnerChallengeState } : current);
        if (result.stage === 'complete') {
          setUseRecovery(false); setTrustDevice(false);
          setState(current => ({ ...(current ?? { configured: true }), role: 'owner', challenge: null }));
          if (!Array.isArray(result.recoveryCodes)) { setCompletionFrom(step); setSignInComplete(true); }
          else await reloadState();
        }
      }
      if (Array.isArray(result.recoveryCodes)) setRecoveryCodes(result.recoveryCodes as string[]);
      if (result.signedOut) { setIssuedCode(null); setRecoveryCodes([]); setPending(null); await reloadState(); router.refresh(); }
      else if (!['login', 'verify', 'reauthenticate', 'totp'].includes(name)) await reloadState();
      return result;
    } catch { setError('service_unavailable'); return null; }
    finally { setBusy(false); }
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === 'credentials' && (!username.trim() || !password)) {
      setError(!username.trim() ? 'username_required' : 'password_required');
      return;
    }
    if ((stage === 'totp' || stage === 'enroll') && !(useRecovery && stage === 'totp' ? otp.trim() : /^\d{6}$/.test(otp))) {
      setError(useRecovery && stage === 'totp' ? 'recovery_code_required' : 'totp_format');
      return;
    }
    if ((stage === 'setup' || stage === 'approval') && !riskCode.trim()) {
      setError(stage === 'setup' ? 'setup_code_required' : 'approval_code_required');
      return;
    }
    if (stage === 'credentials') await action('login', { username, password });
    else await action('verify', { code: stage === 'totp' || stage === 'enroll' ? otp : riskCode, recovery: stage === 'totp' && useRecovery, trustDevice });
  }

  async function cancelChallenge() {
    const result = await action('cancel', {});
    if (result) { setPassword(''); setOtp(''); setRiskCode(''); setUseRecovery(false); await reloadState(); }
  }

  async function reauthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reauthPassword || !/^\d{6}$/.test(reauthCode)) {
      setError(!reauthPassword ? 'password_required' : 'totp_format');
      return;
    }
    const result = await action('reauthenticate', { password: reauthPassword, code: reauthCode });
    setReauthPassword(''); setReauthCode('');
    if (result && pending) { const next = pending; setPending(null); if (next.action) { const completed = await action(next.action, next.body); if (completed?.code) { if (next.action === 'approval') setIssuedApproval(completed.code as string); else setIssuedCode(completed.code as string); } } else await reloadState(); }
  }

  function cancelReauthentication() {
    setPending(null); setReauthPassword(''); setReauthCode(''); setError(null);
  }

  function selectKind(next: 'single' | 'shared') {
    setKind(next);
    setIssuedCode(null);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await action('grant', kind === 'single'
      ? { kind, label, lifetimeDays: lifetimeDays === 'permanent' ? null : Number(lifetimeDays) }
      : { kind, label, lifetimeHours: Number(lifetimeHours), limit: Number(limit) });
    if (result?.code) { setIssuedCode(result.code as string); setLabel(''); }
  }

  const errorMessages: Record<string, [string, string]> = {
    invalid_credentials: ['账号、密码或验证码不正确', 'Incorrect credentials or verification code'], invalid_code: ['验证码无效或已使用，请检查后重试', 'The code is invalid or already used'],
    challenge_expired: ['本次验证已过期，请取消后重新登录', 'Verification expired. Cancel and sign in again'], rate_limited: ['尝试次数过多，请10分钟后再试', 'Too many attempts. Try again in 10 minutes'],
    owner_not_initialized: ['Owner账户尚未初始化，请通过受控终端完成初始化', 'Initialize the Owner account from the controlled terminal first'],
    reauthentication_required: ['请验证密码与当前TOTP，再执行此操作', 'Verify your password and current TOTP before continuing'], session_expired: ['登录已失效，请重新登录', 'Your session expired. Sign in again'],
    forbidden: ['没有执行此操作的权限，请重新登录', 'This action requires a valid Owner session'], password_policy: ['新密码至少8个字符', 'Use a password of at least 8 characters'],
    username_required: ['请填写用户名', 'Enter your username'], password_required: ['请填写密码', 'Enter your password'],
    totp_format: ['请填写6位动态码', 'Enter a 6-digit authenticator code'], recovery_code_required: ['请填写恢复码', 'Enter a recovery code'],
    setup_code_required: ['请填写一次性设置码', 'Enter the one-time setup code'], approval_code_required: ['请填写一次性授权码', 'Enter the one-time approval code'],
    service_unavailable: ['操作未完成，服务暂时不可用，请重试', 'The action was not completed. Please try again'], invalid_request: ['请检查填写内容', 'Check the submitted values'],
  };

  return (
    <section
      aria-label={t('账户与访问', 'Account and access')}
      className="space-y-6 text-[var(--color-text)]"
    >
      {!hideHeader && (
        <header className="space-y-1.5">
          <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
            {t('账户与访问', 'Account & access')}
          </h2>
        </header>
      )}

      {loading && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-[color:var(--color-row-bg)] px-3.5 py-2.5 text-xs text-[var(--color-nav-muted)]">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-sky-dot)] animate-pulse" />
          <span>{t('正在读取账户状态…', 'Loading account status…')}</span>
        </div>
      )}

      {error && !pending && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--badge-rose-fg)]"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-rose-dot)]" />
            <span>{t(...(errorMessages[error] ?? errorMessages.service_unavailable))}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
            aria-label={t('关闭提示', 'Dismiss')}
          >
            ✕
          </button>
        </div>
      )}

      {pending && (
        <dialog
          ref={reauthDialog}
          aria-labelledby={inputId('reauth-title')}
          aria-describedby={inputId('reauth-description')}
          aria-modal="true"
          className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-[480px] max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-[16px] border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-modal-bg,var(--color-bg))] p-0 text-[var(--color-text)] shadow-[0_24px_64px_rgba(0,0,0,0.38)] backdrop:bg-black/45 backdrop:backdrop-blur-[3px] dark:backdrop:bg-black/72"
          onCancel={(event) => { event.preventDefault(); if (!busy) cancelReauthentication(); }}
          onClick={(event) => { if (event.target === event.currentTarget && !busy) cancelReauthentication(); }}
        >
        <form
          ref={reauthForm}
          noValidate
          onSubmit={reauthenticate}
          className="space-y-5 p-6 sm:p-7 [&_label]:text-[0.84rem] [&_label]:text-[var(--color-text-muted)]"
        >
          <div className="space-y-2">
              <h3 id={inputId('reauth-title')} className="text-[1.15rem] font-semibold leading-snug tracking-[-0.01em] text-[var(--color-text)] sm:text-[1.22rem]">
                {t('确认敏感操作', 'Confirm sensitive action')}
              </h3>
              <p id={inputId('reauth-description')} className="text-[0.84rem] leading-6 text-[var(--color-text-muted)]">
                {t('需要重新验证身份以继续', 'Re-authentication required to continue')}
              </p>
          </div>
          {error && error !== 'reauthentication_required' && <p role="alert" className="rounded-lg border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3 py-2 text-[0.8125rem] text-[var(--badge-rose-fg)]">{t(...(errorMessages[error] ?? errorMessages.service_unavailable))}</p>}
          <Field id={inputId('reauth-password')} label={t('当前密码', 'Current password')}>
            <PasswordInput
              id={inputId('reauth-password')}
              language={language}
              passwordLabel={t('当前密码', 'current password')}
              autoComplete="current-password"
              placeholder={t('输入当前密码', 'Enter current password')}
              required
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              className={reauthFieldStyle}
            />
          </Field>
          <Field id={inputId('reauth-code')} label={t('当前 TOTP', 'Current TOTP')}>
            <input
              id={inputId('reauth-code')}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={reauthCode}
              onChange={(e) => setReauthCode(e.target.value)}
              className={`${reauthFieldStyle} font-mono tracking-[0.25em]`}
            />
          </Field>
          <div className="-mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--roadmap-divider,var(--color-border))] px-6 py-4 sm:-mx-7 sm:-mb-7 sm:px-7">
            <button
              type="button"
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-full px-4 text-[0.84rem] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--roadmap-lane-bg)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={cancelReauthentication}
            >
              {t('取消', 'Cancel')}
            </button>
            <button disabled={busy} className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#5ba4cf] px-5 text-[0.84rem] font-medium text-white shadow-xs transition-colors hover:bg-[#4a93be] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? t('验证中…', 'Verifying…') : t('验证并继续', 'Verify and continue')}
            </button>
          </div>
        </form>
        </dialog>
      )}

      {recoveryCodes.length > 0 && (
        <RecoveryCodesDialog codes={recoveryCodes} language={language} onContinue={() => { setRecoveryCodes([]); finishSignIn(); }} />
      )}

      {issuedApproval && role === 'owner' && (
        <div role="status" className="max-w-[480px] rounded-2xl border border-[var(--badge-emerald-border)] bg-[color:var(--color-row-bg)] p-4 sm:p-5 space-y-3 shadow-[var(--shadow-card-sm)]">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-emerald-dot)]" />
            <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
              {t('本次登录的 Owner 授权码', 'Owner approval for this sign-in')}
            </h3>
          </div>
          <code className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-sm font-semibold text-[var(--color-text)] break-all select-all shadow-[var(--shadow-card-sm)]">
            {issuedApproval}
          </code>
          <button className={secondaryStyle} onClick={() => setIssuedApproval(null)}>
            {t('关闭', 'Dismiss')}
          </button>
        </div>
      )}

      {/* 1. 登录界面卡片 */}
      {signInComplete ? (
        <OwnerLoginCompletion language={language} fromStep={completionFrom} />
      ) : (role !== 'owner' || stage === 'enroll') && (
        <div className="rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-indigo-icon)] shadow-[var(--shadow-card-sm)]">
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M8 1.5 2.5 4v4.5c0 3.5 3 5.5 5.5 6 2.5-.5 5.5-2.5 5.5-6V4L8 1.5Z" />
                </svg>
              </span>
              <div>
                <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
                  {t('Owner 登录', 'Owner sign in')}
                </h3>
                <p className="text-[0.8125rem] leading-5 text-[var(--color-nav-dropdown-description)]">
                  {t('可信设备快捷登录，需要时验证身份', 'Quick sign-in on trusted devices, with verification when needed')}
                </p>
              </div>
            </div>
            <span className="text-[0.72rem] text-[var(--color-nav-muted)]">
              {t(`第 ${step + 1} / ${steps.length} 步`, `Step ${step + 1} of ${steps.length}`)}
            </span>
          </div>

          <ol className="flex max-w-[480px] flex-col" aria-label={t('登录步骤', 'Sign-in steps')}>
            {steps.slice(0, step + 1).map((name, index) => (
              <li
                key={name}
                aria-current={step === index ? 'step' : undefined}
                className="relative flex items-center gap-3 pb-3.5 text-[0.8125rem]"
              >
                {index < step && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[11px] top-6 h-3.5 w-px bg-[var(--color-nav-dropdown-border)]"
                  />
                )}
                <span
                  className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors ${
                    step === index
                      ? 'border border-[var(--badge-indigo-border)] bg-[var(--badge-indigo-bg)] font-semibold text-[var(--badge-indigo-fg)] shadow-[var(--shadow-card-sm)]'
                      : index < step
                        ? 'border border-[var(--badge-emerald-border)] bg-[var(--badge-emerald-bg)] font-medium text-[var(--badge-emerald-fg)]'
                        : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-nav-muted)] shadow-[var(--shadow-card-sm)]'
                  }`}
                >
                  {index < step ? '✓' : index + 1}
                </span>
                <span
                  className={
                    step === index
                      ? 'font-medium text-[var(--color-text)]'
                      : 'text-[var(--color-nav-dropdown-description)]'
                  }
                >
                  {name}
                </span>
                {index < step && (
                  <span className="ml-auto text-xs text-[var(--color-nav-muted)]">
                    {t('已验证', 'Verified')}
                  </span>
                )}
              </li>
            ))}
          </ol>

          <form noValidate onSubmit={advance} className="max-w-[480px] space-y-4">
            {stage === 'credentials' ? (
              <>
                <Field id={inputId('username')} label={t('用户名', 'Username')}>
                  <input
                    id={inputId('username')}
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('输入 Owner 用户名', 'Owner username')}
                    required
                    className={fieldStyle}
                  />
                </Field>
                <Field id={inputId('password')} label={t('密码', 'Password')}>
                  <PasswordInput
                    id={inputId('password')}
                    name="password"
                    language={language}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('输入密码', 'Enter password')}
                    required
                    className={fieldStyle}
                  />
                </Field>
              </>
            ) : stage === 'setup' ? (
              <>
                <p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                  {t('填写受控终端初始化时签发的一次性设置码，然后绑定验证器', 'Enter the one-time setup code issued during terminal initialization, then enroll your authenticator')}
                </p>
                <Field id={inputId('setup')} label={t('一次性设置码', 'One-time setup code')}>
                  <input
                    id={inputId('setup')}
                    autoComplete="one-time-code"
                    required
                    value={riskCode}
                    onChange={(e) => setRiskCode(e.target.value)}
                    className={fieldStyle}
                  />
                </Field>
              </>
            ) : stage === 'totp' || stage === 'enroll' ? (
              <>
                <div className="space-y-1">
                  <h4 className="text-[0.875rem] font-medium text-[var(--color-text)]">
                    {t('验证器确认', 'Authenticator verification')}
                  </h4>
                  <p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                    {t(
                      '填写验证器中的 6 位动态码，验证请求5分钟内有效',
                      'Enter the 6-digit authenticator code within the 5-minute verification window',
                    )}
                  </p>
                </div>
                {stage === 'enroll' && challenge?.secret && (
                  <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5 text-xs shadow-[var(--shadow-card-sm)]">
                    <p>{t('在验证器中添加账户，选择基于时间的6位动态码', 'Add a time-based, six-digit account in your authenticator')}</p>
                    <p className="text-[var(--color-nav-muted)]">{t('账户', 'Account')}: Incept / {challenge.username}</p>
                    <code className="block break-all font-mono text-sm font-semibold select-all text-[var(--color-text)]">{challenge.secret}</code>
                  </div>
                )}
                {stage === 'enroll' && (
                  <label className="flex items-start gap-2.5 text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      disabled={busy}
                      className="mt-0.5 size-4 rounded accent-[var(--badge-indigo-icon)] shrink-0"
                    />
                    <span>{t('信任此浏览器30天；低风险时可凭密码登录', 'Trust this browser for 30 days; low-risk sign-ins need only your password')}</span>
                  </label>
                )}
                <Field id={inputId('otp')} label={useRecovery && stage === 'totp' ? t('恢复码', 'Recovery code') : t('TOTP 动态码', 'TOTP code')}>
                  <input
                    id={inputId('otp')}
                    name="totp"
                    inputMode={useRecovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    pattern={useRecovery ? undefined : '[0-9]{6}'}
                    maxLength={useRecovery ? 256 : 6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder={useRecovery ? 'REC-…' : '000000'}
                    required
                    className={`${fieldStyle} font-mono ${useRecovery ? 'tracking-normal' : 'tracking-[0.25em]'}`}
                  />
                </Field>
                {stage === 'totp' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseRecovery(!useRecovery);
                      setOtp('');
                    }}
                    disabled={busy}
                    className="text-xs text-[var(--color-nav-muted)] hover:text-[var(--color-text)] transition-colors underline underline-offset-4"
                  >
                    {useRecovery ? t('使用验证器', 'Use authenticator') : t('使用恢复码', 'Use recovery code')}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h4 className="text-[0.875rem] font-medium text-[var(--color-text)]">
                    {t('首次 / 未知设备授权', 'First / unknown device approval')}
                  </h4>
                  <p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                    {t(
                      '在已登录设备或受控 SSH 中签发一次性授权码，绑定本次登录，10 分钟有效、仅可用一次',
                      'Issue a login-bound approval code from a signed-in device or controlled SSH. Valid for 10 minutes, once only.',
                    )}
                  </p>
                </div>
                {challenge?.challengeId && (
                  <p className="text-xs break-all text-[var(--color-nav-dropdown-description)]">
                    {t('登录请求编号', 'Sign-in request ID')}: <code className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono select-all text-[var(--color-text)]">{challenge.challengeId}</code>
                  </p>
                )}
                <Field id={inputId('risk')} label={t('Owner 一次性授权码', 'One-time Owner approval code')}>
                  <input
                    id={inputId('risk')}
                    name="approval"
                    autoComplete="one-time-code"
                    value={riskCode}
                    onChange={(e) => setRiskCode(e.target.value)}
                    placeholder={t('粘贴本次登录授权码', 'Paste this login approval code')}
                    required
                    className={fieldStyle}
                  />
                </Field>
                <label className="flex items-start gap-2.5 text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                    className="mt-0.5 size-4 rounded accent-[var(--badge-indigo-icon)] shrink-0"
                  />
                  <span>
                    {t(
                      '信任此设备30天；低风险时可凭密码登录；公共设备请勿勾选',
                      'Trust this device for 30 days for password-only sign-in at low risk; avoid on public devices',
                    )}
                  </span>
                </label>
              </>
            )}

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button type="submit" disabled={busy || loading} className={primaryStyle}>
                {busy ? t('验证中…', 'Verifying…') : stage === 'credentials' ? t('登录', 'Sign in') : step === steps.length - 1 ? t('完成登录', 'Complete sign-in') : t('下一步', 'Continue')}
              </button>
              {step > 0 && (
                <button
                  type="button"
                  className={secondaryStyle}
                  disabled={busy}
                  onClick={cancelChallenge}
                >
                  {t('取消', 'Cancel')}
                </button>
              )}
            </div>

          </form>

          {step < steps.length - 1 && (
            <ol
              start={step + 2}
              className="flex max-w-[480px] flex-col gap-3 border-t border-[var(--color-nav-dropdown-border)] pt-4"
              aria-label={t('接下来', 'Next steps')}
            >
              {steps.slice(step + 1).map((name, offset) => (
                <li
                  key={name}
                  className="flex items-start gap-3 text-[0.8125rem] text-[var(--color-nav-dropdown-description)]"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-nav-muted)] shadow-[var(--shadow-card-sm)]"
                  >
                    {step + offset + 2}
                  </span>
                  <div className="pt-0.5">
                    <p className="font-medium text-[var(--color-text)]">{name}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                      {step + offset + 1 === 1
                        ? t('需要时填写验证器动态码', 'Enter an authenticator code when required')
                        : t('首次或风险登录时，使用一次性授权码确认', 'Approve first or risky sign-ins with a one-time code')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 2. Owner 账户与安全设置卡片 */}
      {!signInComplete && role === 'owner' && state?.management && (
        <>
          <div className="rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-indigo-icon)] shadow-[var(--shadow-card-sm)]">
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="5" r="3" />
                    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
                    {t('Owner 账户', 'Owner account')}
                  </h3>
                  <p className="text-[0.8125rem] leading-5 text-[var(--color-nav-dropdown-description)]">
                    {t('安全设置与设备会话', 'Security settings and device sessions')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[0.875rem] font-medium text-[var(--color-text)]">
                    {t('安全设置', 'Security settings')}
                  </h4>
                  <p className="mt-0.5 text-xs text-[var(--color-nav-dropdown-description)]">
                    {t('敏感操作需要5分钟内再认证', 'Sensitive actions require reauthentication within 5 minutes')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className={secondaryStyle}
                  onClick={() => setPending({ action: '', body: {} })}
                >
                  {t('验证身份', 'Verify identity')}
                </button>
              </div>
              <OwnerSecurityPanel
                state={state.management}
                language={language}
                busy={busy}
                action={action}
                onEnrollment={(result) =>
                  setState((current) => (current ? { ...current, challenge: result as OwnerChallengeState } : current))
                }
                onRecoveryCodes={setRecoveryCodes}
              />
              <SyncDevicesPanel language={language} />
            </div>
          </div>

          {/* 3. 临时 Pro 授权卡片 */}
          <div className="rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-sky-icon)] shadow-[var(--shadow-card-sm)]">
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="12" height="10" rx="2" />
                    <path d="M2 7h12M5 10h2" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
                    {t('Pro 授权', 'Pro access')}
                  </h3>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[var(--color-text)]">
                {t('授权方式', 'Grant mode')}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-w-[480px]">
                {(['single', 'shared'] as const).map((mode) => {
                  const active = kind === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectKind(mode)}
                      className={`flex items-start gap-3 rounded-xl p-3 text-left transition-all ${
                        active
                          ? 'bg-[var(--color-bg)] shadow-[var(--shadow-card-sm)] text-[var(--color-text)]'
                          : 'bg-[var(--color-bg)]/40 hover:bg-[var(--color-bg)]/80 text-[var(--color-nav-dropdown-description)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          active
                            ? 'border-[var(--badge-sky-dot)] bg-[var(--badge-sky-bg)]'
                            : 'border-[var(--color-border)] bg-transparent'
                        }`}
                      >
                        {active && <span className="size-1.5 rounded-full bg-[var(--badge-sky-dot)]" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-medium text-[var(--color-text)]">
                          {mode === 'single' ? t('单次邀请', 'Single invitation') : t('范围分享', 'Group sharing')}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                          {mode === 'single' ? t('点对点分发，长期可控', 'Point-to-point, long-term control') : t('团队或公开分发，短期有效', 'Team or public distribution, short-lived')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={generate} className="max-w-[480px] space-y-3.5">
              <Field id={inputId('label')} label={t('用途标签', 'Purpose label')}>
                <input
                  id={inputId('label')}
                  value={label}
                  maxLength={60}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('例如：作品审阅 / 朋友阅读', 'e.g. Portfolio review / friends')}
                  className={fieldStyle}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  id={inputId('lifetime')}
                  label={t('有效时间', 'Lifetime')}
                >
                  <CustomSelect
                    id={inputId('lifetime')}
                    value={kind === 'single' ? lifetimeDays : lifetimeHours}
                    onChange={(val) => (kind === 'single' ? setLifetimeDays(val) : setLifetimeHours(val))}
                    options={(kind === 'single' ? ['1', '7', '30', 'permanent'] : ['1', '6', '24']).map((value) => ({
                      value,
                      label: `${value === 'permanent' ? t('永久（手动撤销）', 'Permanent (manual revocation)') : `${value} ${kind === 'single' ? t('天', 'days') : t('小时', 'hours')}`}${value === (kind === 'single' ? '7' : '6') ? t('（默认）', ' (default)') : ''}`,
                    }))}
                    disabled={busy}
                  />
                </Field>

                {kind === 'shared' && (
                  <Field id={inputId('limit')} label={t('浏览器凭据上限', 'Browser credential limit')}>
                    <CustomSelect
                      id={inputId('limit')}
                      value={limit}
                      onChange={(val) => setLimit(val)}
                      options={['2', '5', '10', '20'].map((value) => ({
                        value,
                        label: `${value} ${t('个浏览器', 'browsers')}${value === '10' ? t('（默认）', ' (default)') : ''}`,
                      }))}
                      disabled={busy}
                    />
                  </Field>
                )}
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-bg)] p-3 text-xs leading-5 text-[var(--color-nav-dropdown-description)] shadow-[var(--shadow-card-sm)]">
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--badge-sky-dot)]" />
                <span>{summary}</span>
              </div>

              <button type="submit" disabled={busy} className={primaryStyle}>
                {busy ? t('生成中…', 'Generating…') : t('生成授权码', 'Generate access code')}
              </button>
            </form>

            {issuedCode && (
              <div
                role="status"
                className="max-w-[480px] rounded-xl border border-[var(--badge-emerald-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-card-sm)] space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-emerald-dot)]" />
                  <p className="text-xs text-[var(--color-nav-dropdown-description)]">
                    {t('完整授权码仅此次显示，关闭前请保存', 'The full access code is shown once. Save it before dismissal')}
                  </p>
                </div>
                <code className="block rounded-lg border border-[var(--color-border)] bg-[color:var(--color-row-bg)] px-3 py-2 font-mono text-sm font-semibold text-[var(--color-text)] break-all select-all">
                  {issuedCode}
                </code>
                <button type="button" className={secondaryStyle} onClick={() => setIssuedCode(null)}>
                  {t('关闭', 'Dismiss')}
                </button>
              </div>
            )}

            <div className="border-t border-[var(--color-nav-dropdown-border)] pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[0.875rem] font-medium text-[var(--color-text)]">
                  {t('授权记录', 'Grant records')}
                </h4>
                <span className="text-[0.72rem] text-[var(--color-nav-muted)]">
                  {t(`${grants.length} 条记录`, `${grants.length} record(s)`)}
                </span>
              </div>

              {grants.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--color-nav-muted)]">
                  {t('暂无授权记录', 'No grants yet')}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-nav-dropdown-border)]">
                  {grants.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-sm font-medium text-[var(--color-text)]">
                            {grant.label || t('未命名授权', 'Untitled grant')}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${
                              grant.revoked
                                ? 'border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] text-[var(--badge-rose-fg)]'
                                : 'border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full"
                              style={{
                                backgroundColor: grant.revoked ? 'var(--badge-rose-dot)' : 'var(--badge-amber-dot)',
                              }}
                            />
                            <span>{grant.kind === 'single' ? t('邀请', 'Invitation') : t('分享', 'Sharing')}</span>
                            <span>·</span>
                            <span>{grant.revoked ? t('已撤销', 'Revoked') : grant.expiresAt && new Date(grant.expiresAt).getTime() <= checkedAt ? t('已到期', 'Expired') : grant.mode === 'single' && grant.redeemedCount > 0 ? t('已兑换', 'Redeemed') : grant.redeemExpiresAt && new Date(grant.redeemExpiresAt).getTime() <= checkedAt ? t('兑换已截止', 'Redemption closed') : grant.mode === 'shared' && grant.maxRedemptions !== null && grant.redeemedCount >= grant.maxRedemptions ? t('仅已有浏览器', 'Existing browsers only') : t('可兑换', 'Redeemable')}</span>
                          </span>
                        </div>
                        <p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">
                          {grant.kind === 'single' && grant.entitlementSeconds !== null
                            ? t(
                                `旧邀请：兑换截止 ${grant.redeemExpiresAt ? new Date(grant.redeemExpiresAt).toLocaleString('zh-CN') : '—'} · 兑换后 ${grant.entitlementSeconds / 3600} 小时`,
                                `Legacy invitation: redeem by ${grant.redeemExpiresAt ? new Date(grant.redeemExpiresAt).toLocaleString('en-US') : '—'} · ${grant.entitlementSeconds / 3600}h after redemption`,
                              )
                            : grant.kind === 'single'
                              ? grant.expiresAt
                                ? t(`统一到期 ${new Date(grant.expiresAt).toLocaleString('zh-CN')} · 仅可兑换一次`, `Expires ${new Date(grant.expiresAt).toLocaleString('en-US')} · redeemable once`)
                                : t('永久 · 手动撤销 · 仅可兑换一次', 'Permanent · manual revocation · redeemable once')
                              : t(
                                `统一到期 ${grant.expiresAt ? new Date(grant.expiresAt).toLocaleString('zh-CN') : '—'} · ${grant.redeemedCount}/${grant.maxRedemptions ?? '不限'} 个浏览器`,
                                `Expires ${grant.expiresAt ? new Date(grant.expiresAt).toLocaleString('en-US') : '—'} · ${grant.redeemedCount}/${grant.maxRedemptions ?? 'unlimited'} browsers`,
                              )}{' '}
                          · {grant.codeHint ? `••••${grant.codeHint}` : t('旧授权', 'Legacy grant')}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={grant.revoked || busy}
                        className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[0.78rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={async () => {
                          if (confirmGrant !== grant.id) {
                            setConfirmGrant(grant.id);
                            return;
                          }
                          const result = await action('revoke-grant', { grantId: grant.id });
                          if (result) {
                            setConfirmGrant(null);
                            setIssuedCode(null);
                          }
                        }}
                      >
                        {confirmGrant === grant.id ? t('确认撤销', 'Confirm revoke') : t('撤销', 'Revoke')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs leading-5 text-[var(--color-nav-muted)]">
                {t(
                  '撤销后，对应授权与会话立即失效',
                  'Revocation immediately invalidates the associated grant and sessions',
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
