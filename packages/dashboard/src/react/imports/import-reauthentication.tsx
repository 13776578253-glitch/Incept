import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ImportDialogState } from './use-import-dialog';

// Keep step-up verification inside the current import dialog and clear submitted credentials.
export function ImportReauthentication({ busy, authError, reauthenticate, cancelReauthentication }: Pick<ImportDialogState,
  'busy' | 'authError' | 'reauthenticate' | 'cancelReauthentication'>) {
  const t = useTranslations('dashboard.imports');
  const inputId = useId();
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [visible, setVisible] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!busy) passwordInput.current?.focus(); }, [busy]);
  const errorKey = authError === 'invalid_credentials' || authError === 'invalid_code' ? 'authInvalid'
    : authError === 'password_required' ? 'passwordRequired' : authError === 'totp_format' ? 'totpFormat'
      : authError === 'forbidden' || authError === 'session_expired' ? 'authSessionExpired'
        : authError === 'rate_limited' ? 'authRateLimited' : 'authUnavailable';
  return <form noValidate onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    void reauthenticate(password, code);
    setPassword(''); setCode(''); setVisible(false);
  }} className="dashboard-import-reauth" aria-labelledby="dashboard-import-reauth-title">
    <div className="space-y-1">
      <h3 id="dashboard-import-reauth-title" className="text-sm font-semibold">{t('authTitle')}</h3>
      <p className="text-xs leading-5 text-[var(--color-text-muted)]">{t('authHint')}</p>
    </div>
    {authError ? <p role="alert" className="text-xs text-[var(--badge-rose-fg)]">{t(errorKey)}</p> : null}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1 text-xs">
        <label htmlFor={`${inputId}-password`}>{t('currentPassword')}</label>
        <span className="relative block">
          <input id={`${inputId}-password`} ref={passwordInput} type={visible ? 'text' : 'password'} autoComplete="current-password" value={password}
            disabled={busy} onChange={event => setPassword(event.target.value)}
            className="dashboard-import-auth-input dashboard-import-auth-password [&::-ms-reveal]:hidden [&::-ms-clear]:hidden" />
          <button type="button" disabled={busy} aria-label={t(visible ? 'hidePassword' : 'showPassword')} aria-pressed={visible}
            className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-md text-[var(--color-text-muted)] focus-visible:outline-2"
            onClick={() => setVisible(current => !current)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
              {visible ? <path d="m3 3 18 18" /> : null}
            </svg>
          </button>
        </span>
      </div>
      <label className="min-w-0 space-y-1 text-xs">
        <span>{t('currentTotp')}</span>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code}
          disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="dashboard-import-auth-input font-mono tracking-[0.2em]" />
      </label>
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="dashboard-import-button" disabled={busy} onClick={cancelReauthentication}>{t('authCancel')}</button>
      <button type="submit" className="dashboard-import-button is-primary" disabled={busy || !password || !/^\d{6}$/.test(code)}>{t(busy ? 'authWorking' : 'authContinue')}</button>
    </div>
  </form>;
}
