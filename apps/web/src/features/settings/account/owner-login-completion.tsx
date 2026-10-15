'use client';

import { useEffect, useState } from 'react';
import styles from './owner-login-success.module.css';

export const LOGIN_STEP_ANIMATION_MS = 320;
export const LOGIN_SUCCESS_HOLD_MS = 400;

export function OwnerLoginCompletion({ language, fromStep }: { language: 'zh' | 'en'; fromStep: number }) {
  const [step, setStep] = useState(fromStep);
  const [finished, setFinished] = useState(false);
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;
  const steps = [t('账号密码', 'Credentials'), 'TOTP', t('授权确认', 'Approval')];

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    for (let next = fromStep + 1; next < 3; next++) {
      timers.push(window.setTimeout(() => setStep(next), reducedMotion ? 0 : (next - fromStep) * LOGIN_STEP_ANIMATION_MS));
    }
    timers.push(window.setTimeout(() => setFinished(true), reducedMotion ? 0 : (3 - fromStep) * LOGIN_STEP_ANIMATION_MS));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [fromStep]);

  return (
    <div className="space-y-5 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-indigo-icon)] shadow-[var(--shadow-card-sm)]">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 1.5 2.5 4v4.5c0 3.5 3 5.5 5.5 6 2.5-.5 5.5-2.5 5.5-6V4L8 1.5Z" />
            </svg>
          </span>
          <div>
            <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">{t('Owner 登录', 'Owner sign in')}</h3>
            <p className="text-[0.8125rem] leading-5 text-[var(--color-nav-dropdown-description)]">{t('可信设备快捷登录，需要时验证身份', 'Quick sign-in on trusted devices, with verification when needed')}</p>
          </div>
        </div>
        <span className="text-[0.72rem] text-[var(--color-nav-muted)]">{t(`第 ${step + 1} / 3 步`, `Step ${step + 1} of 3`)}</span>
      </div>
      <ol className="flex max-w-[480px] flex-col" aria-label={t('登录步骤', 'Sign-in steps')}>
        {steps.map((name, index) => (
          <li key={name} aria-current={step === index ? 'step' : undefined} className="relative flex items-center gap-3 pb-3.5 text-[0.8125rem]">
            {index < 2 && <span aria-hidden="true" className="absolute left-[11px] top-6 h-3.5 w-px bg-[var(--color-nav-dropdown-border)]" />}
            <span className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${index <= step
              ? `border border-[var(--badge-emerald-border)] bg-[var(--badge-emerald-bg)] text-[var(--badge-emerald-fg)] ${index === step ? styles.success : ''}`
              : 'border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-nav-muted)]'}`}>
              {index <= step ? <svg key={index === step ? 'current' : 'completed'} aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path className={index === step ? styles.check : undefined} d="m5 12 4 4L19 6" /></svg> : index + 1}
            </span>
            <span className={step === index ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-nav-dropdown-description)]'}>{name}</span>
            {index <= step && <span className="ml-auto text-xs text-[var(--color-nav-muted)]">{index <= fromStep ? t('已验证', 'Verified') : t('已完成', 'Completed')}</span>}
          </li>
        ))}
      </ol>
      <div role="status" aria-live="polite" className="flex min-h-[96px] items-center justify-center gap-3 text-[0.9375rem] font-medium">
        {finished && <span className={`${styles.success} flex size-9 items-center justify-center rounded-full bg-[var(--badge-emerald-bg)] text-[var(--badge-emerald-icon)]`}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path className={styles.check} d="m5 12 4 4L19 6" /></svg></span>}
        <p>{finished ? t('登录成功', 'Signed in') : t('正在完成登录…', 'Completing sign-in…')}</p>
      </div>
    </div>
  );
}
