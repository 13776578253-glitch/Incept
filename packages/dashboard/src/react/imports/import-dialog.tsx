'use client';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useImportDialog } from './use-import-dialog';
import { ImportPreviewPanel } from './import-preview';
import { ImportHistory } from './import-history';
import { ImportReauthentication } from './import-reauthentication';
import { CloseIcon, ImportIcon } from './import-icons';

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const t = useTranslations('dashboard.imports'), dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const state = useImportDialog(onImported);
  useEffect(() => {
    const elements = [document.documentElement, document.body];
    const previous = elements.map(element => ({ overflow: element.style.overflow, overscrollBehavior: element.style.overscrollBehavior }));
    elements.forEach(element => { element.style.overflow = 'hidden'; element.style.overscrollBehavior = 'none'; });
    dialog.current?.showModal();
    title.current?.focus({ preventScroll: true });
    return () => elements.forEach((element, index) => {
      element.style.overflow = previous[index].overflow;
      element.style.overscrollBehavior = previous[index].overscrollBehavior;
    });
  }, []);
  return <dialog ref={dialog} aria-labelledby="dashboard-import-title" aria-describedby="dashboard-import-description" onCancel={event => { if (state.busy) event.preventDefault(); else onClose(); }}
    className="dashboard-import-dialog">
    <div className="dashboard-import-main dashboard-subtle-scrollbar">
      <header className="space-y-2">
        <h2 ref={title} tabIndex={-1} id="dashboard-import-title" className="text-[1.15rem] font-semibold leading-snug tracking-[-0.01em] outline-none sm:text-[1.22rem]">{t('title')}</h2>
        <p id="dashboard-import-description" className="text-[0.84rem] leading-6 text-[var(--color-text-muted)]">{t('intro')}</p>
      </header>
      <div className="dashboard-import-file-area">
        <label className="dashboard-import-button cursor-pointer">
          <span className="text-[var(--color-text-muted)]"><ImportIcon /></span>{t('chooseFile')}
          <input className="sr-only" aria-label={t('chooseFile')} type="file" accept=".json,application/json" disabled={state.busy || state.reauthRequired}
            onChange={event => { void state.chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {state.fileName ? <span className="max-w-full break-all text-[0.76rem] text-[var(--color-text-muted)]">{state.fileName}</span> : null}
      </div>
      {state.error ? <p role="alert" className="rounded-xl border border-[var(--badge-rose-dot)] p-3 text-xs">{state.error}</p> : null}
      {state.busy ? <p role="status" className="text-xs text-[var(--color-nav-muted)]">{t('working')}</p> : null}
      {state.reauthRequired ? <ImportReauthentication {...state} /> : null}
      <ImportPreviewPanel {...state} busy={state.busy || state.reauthRequired} />
      {state.receipt ? <p role="status" className="break-all rounded-xl bg-[var(--color-row-bg)] p-3 text-xs">{t('success')} · {state.receipt.id}</p> : null}
    </div>
    <aside className="dashboard-import-sidebar">
      <div className="dashboard-import-history dashboard-subtle-scrollbar">
        <ImportHistory history={state.history} headingAction={<button type="button" className="dashboard-import-close" aria-label={t('close')}
          title={t('close')} disabled={state.busy} onClick={onClose}><CloseIcon /></button>} />
      </div>
      {state.preview ? <div className="dashboard-import-actions">
        {state.dirty ? <button className="dashboard-import-button" disabled={state.busy || state.reauthRequired} onClick={() => void state.revalidate()}>{t('revalidate')}</button> : null}
        <button className="dashboard-import-button is-primary" disabled={state.busy || state.reauthRequired || state.dirty || state.preview.conflicts > 0 || !!state.receipt}
          onClick={() => void state.commit()}>{t(state.receipt ? 'imported' : 'confirm')}</button>
      </div> : null}
    </aside>
  </dialog>;
}
