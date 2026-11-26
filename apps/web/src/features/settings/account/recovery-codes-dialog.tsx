'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function RecoveryCodesDialog({ codes, language, onContinue }: {
  codes: string[]; language: 'zh' | 'en'; onContinue: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    continueButton.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  async function copyCodes() {
    try { await navigator.clipboard.writeText(codes.join('\n')); setCopyState('copied'); }
    catch { setCopyState('failed'); }
  }

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={event => event.preventDefault()}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-[600px] max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-0 text-[var(--color-text)] shadow-[var(--shadow-nav-dropdown)] backdrop:bg-black/45 backdrop:backdrop-blur-[3px] dark:backdrop:bg-black/72"
    >
      <div className="space-y-5 p-6 sm:p-7">
        <div className="space-y-1.5">
          <h3 id={`${id}-title`} className="text-[length:var(--text-lg)] font-semibold leading-snug tracking-[-0.015em] text-[var(--color-text)]">
            {t('保存恢复码', 'Save recovery codes')}
          </h3>
          <p id={`${id}-description`} className="text-[length:var(--text-sm)] leading-6 text-[var(--color-text-muted)]">
            {t('每个码只能使用一次；本次关闭后无法再次查看。请先保存，再点击“已保存，继续”。更新整组会使旧码失效。', 'Each code works once and is shown only now. Save them before choosing “Saved, continue”. Rotating the set invalidates old codes.')}
          </p>
        </div>
        <ul className="grid gap-2 font-mono text-[length:var(--text-xs)] text-[var(--color-text)]">
          {codes.map((code, index) => (
            <li key={code} className="flex items-start gap-3 rounded-[9px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] px-3 py-2.5">
              <span aria-hidden="true" className="w-4 shrink-0 text-[var(--color-nav-muted)]">{index + 1}.</span>
              <code className="min-w-0 break-all select-all">{code}</code>
            </li>
          ))}
        </ul>
        {copyState === 'failed' && <p role="alert" className="rounded-lg border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-3 py-2 text-[length:var(--text-xs)] text-[var(--badge-rose-fg)]">{t('复制未完成，请手动选择并保存恢复码。', 'Copy failed. Select and save the recovery codes manually.')}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-faint)] px-6 py-4 sm:px-7">
        <button type="button" onClick={copyCodes} className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-[length:var(--text-xs)] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-subtle)]">
          <span role="status">{copyState === 'copied' ? t('已复制', 'Copied') : t('复制全部', 'Copy all')}</span>
        </button>
        <button ref={continueButton} type="button" onClick={onContinue} className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-primary-bg)] px-5 text-[length:var(--text-xs)] font-medium text-[color:var(--color-primary-fg)] shadow-[var(--shadow-card-sm)] transition-all hover:brightness-[1.06] active:scale-[0.98]">
          {t('已保存，继续', 'Saved, continue')}
        </button>
      </div>
    </dialog>
  );
}
