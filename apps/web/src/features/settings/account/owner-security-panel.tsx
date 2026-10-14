'use client';

import { useState, type FormEvent } from 'react';
import type { OwnerManagementState } from './account-types';

const inputStyle = 'min-h-10 w-full min-w-0 rounded-[12px] bg-[var(--color-bg)] px-3.5 text-[0.8125rem] text-[var(--color-text)] shadow-[var(--shadow-card-sm)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)]';
const buttonStyle = 'inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--color-bg)] px-4 text-[0.8125rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)] disabled:opacity-50';

export function OwnerSecurityPanel({ state, language, busy, action, onEnrollment, onRecoveryCodes }: {
  state: OwnerManagementState; language: 'zh' | 'en'; busy: boolean;
  action: (name: string, body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onEnrollment: (result: Record<string, unknown>) => void; onRecoveryCodes: (codes: string[]) => void;
}) {
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const [open, setOpen] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [approvedCode, setApprovedCode] = useState<string | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState('');
  const date = (value: string | null) => value ? new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : '—';

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) return;
    const result = await action('password', { password: newPassword });
    if (result) { setNewPassword(''); setConfirmation(''); setOpen(null); }
  }

  const rows = [
    ['password', t('更改密码', 'Change password'), t('更改后撤销所有旧会话与可信设备。', 'Revoke all existing sessions and trusted devices.')],
    ['totp', t('验证器与恢复码', 'Authenticator & recovery'), t('重新绑定 TOTP，或更新一次性恢复码。', 'Re-enroll TOTP or rotate one-time recovery codes.')],
    ['sessions', t('可信设备与会话', 'Devices & sessions'), t('查看和撤销设备，退出指定或全部会话。', 'Review and revoke devices, or sign out of sessions.')],
    ['approval', t('签发登录授权码', 'Issue login approval'), t('批准另一台设备的首次或未知网络登录。', 'Approve a sign-in on another device or network.')],
    ['audits', t('安全操作记录', 'Security activity'), t('查看最近认证、授权和恢复操作的结果。', 'Review recent authentication, grants and recovery outcomes.')],
  ];
  return <div className="space-y-5">
    <div className="divide-y divide-[var(--color-nav-dropdown-border)]">
      {rows.map(([key, name, description]) => <div key={key} className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-4"><div className="min-w-0 space-y-1"><h4 className="text-[0.8125rem] font-medium">{name}</h4><p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">{description}</p></div><button type="button" aria-expanded={open === key} onClick={() => { setOpen(open === key ? null : key); setApprovedCode(null); setNewPassword(''); setConfirmation(''); }} className={`${buttonStyle} shrink-0`}>{open === key ? t('收起', 'Close') : t('管理', 'Manage')}</button></div>
        {open === key && <div className="space-y-4 border-t border-[var(--color-nav-dropdown-border)] pt-4">
          {key === 'password' && <form onSubmit={changePassword} className="max-w-[444px] space-y-3">
            <label className="block space-y-1.5 text-xs"><span>{t('新密码（至少12个字符）', 'New password (12+ characters)')}</span><input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputStyle}/></label>
            <label className="block space-y-1.5 text-xs"><span>{t('确认新密码', 'Confirm new password')}</span><input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputStyle}/></label>
            {confirmation && confirmation !== newPassword && <p className="text-xs text-[var(--badge-rose-fg)]">{t('两次密码不一致。', 'The passwords do not match.')}</p>}
            <button disabled={busy || !newPassword || newPassword !== confirmation} className={buttonStyle}>{t('确认改密并退出', 'Change password and sign out')}</button>
          </form>}
          {key === 'totp' && <div className="space-y-3"><p className="text-xs leading-5 text-[var(--color-nav-dropdown-description)]">{t('重新绑定完成后会撤销旧会话和设备，旧恢复码也将失效。', 'Re-enrollment revokes existing sessions, devices and recovery codes.')}</p><div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonStyle} onClick={async () => { const result = await action('totp', {}); if (result) onEnrollment(result); }}>{t('重新绑定验证器', 'Re-enroll authenticator')}</button><button disabled={busy} className={buttonStyle} onClick={async () => { const result = await action('recovery-codes', {}); if (result?.recoveryCodes) onRecoveryCodes(result.recoveryCodes as string[]); }}>{t('更新恢复码', 'Rotate recovery codes')}</button></div></div>}
          {key === 'sessions' && <>
            <h5 className="text-xs font-medium">{t('登录会话', 'Signed-in sessions')}</h5>
            <ul className="space-y-3">{state.sessions.map(session => <li key={session.id} className="flex items-center justify-between gap-3"><div className="min-w-0 text-xs"><p className="break-words">{session.id === state.sessionId ? t('当前设备', 'This device') : session.deviceLabel ?? t('其他设备', 'Other device')}</p><p className="mt-1 text-[var(--color-nav-muted)]">{t('最近活动', 'Last active')} {date(session.lastUsedAt ?? session.createdAt)} · {t('到期', 'Expires')} {date(session.expiresAt)}</p></div><button disabled={busy} className={`${buttonStyle} shrink-0`} onClick={() => action('session', { id: session.id })}>{t('退出', 'Sign out')}</button></li>)}</ul>
            <h5 className="text-xs font-medium">{t('可信设备', 'Trusted devices')}</h5>
            {state.devices.length ? <ul className="space-y-3">{state.devices.map(device => <li key={device.id} className="flex items-center justify-between gap-3"><div className="min-w-0 text-xs"><p className="break-words">{device.label}</p><p className="text-[var(--color-nav-muted)]">{date(device.expiresAt)}</p></div><button disabled={busy} className={`${buttonStyle} shrink-0`} onClick={() => action('device', { id: device.id })}>{t('撤销', 'Revoke')}</button></li>)}</ul> : <p className="text-xs text-[var(--color-nav-muted)]">{t('没有可信设备。', 'No trusted devices.')}</p>}
            <button disabled={busy} className={buttonStyle} onClick={() => action('sessions-all', {})}>{t('确认退出全部设备', 'Sign out all devices')}</button>
          </>}
          {key === 'approval' && <div className="max-w-[480px] space-y-3">
            <label className="block text-xs space-y-1.5"><span>{t('待批准的登录', 'Pending sign-in')}</span><select className={inputStyle} value={selectedChallenge} onChange={e => setSelectedChallenge(e.target.value)}><option value="">{t('选择登录请求', 'Select a sign-in request')}</option>{state.challenges.map(challenge => <option key={challenge.id} value={challenge.id}>{challenge.id} · {challenge.deviceLabel.slice(0, 45)}</option>)}</select></label>
            <button disabled={busy || !selectedChallenge} className={buttonStyle} onClick={async () => { const result = await action('approval', { challengeId: selectedChallenge }); if (result?.code) setApprovedCode(result.code as string); }}>{t('签发一次性授权码', 'Issue one-time approval code')}</button>
            {approvedCode && <div role="status" className="space-y-2"><p className="text-xs">{t('完整码仅此次显示，交给请求登录的设备。', 'Shown once. Enter it on the device requesting sign-in.')}</p><code className="block break-all text-sm">{approvedCode}</code><button className={buttonStyle} onClick={() => setApprovedCode(null)}>{t('关闭', 'Dismiss')}</button></div>}
            <ul className="space-y-2">{state.permits.map(permit => <li key={permit.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>••••{permit.codeHint} · {date(permit.expiresAt)}</span><button disabled={busy} className={buttonStyle} onClick={() => action('permit', { id: permit.id })}>{t('撤销', 'Revoke')}</button></li>)}</ul>
          </div>}
          {key === 'audits' && <ul className="space-y-2 text-xs">{state.audits.map(audit => <li key={audit.id} className="flex flex-wrap justify-between gap-2"><span className="break-all">{audit.action} · {audit.result}</span><time className="text-[var(--color-nav-muted)]">{date(audit.createdAt)}</time></li>)}</ul>}
        </div>}
      </div>)}
    </div>
  </div>;
}
