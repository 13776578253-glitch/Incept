'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DocsMetadataUpdatePayload } from '../docs-settings-panel';

export type DocsMetadataEditTarget = {
  targetType: 'document' | 'collection';
  targetId: number;
  locale: 'en' | 'zh';
  slug: string;
  title: string;
  accessRole: 'guest' | 'pro' | 'private';
};

type AccessRoleValue = DocsMetadataEditTarget['accessRole'];

type DocsMetadataEditDialogProps = {
  target: DocsMetadataEditTarget;
  onClose: () => void;
  onSaved: (update: DocsMetadataUpdatePayload) => void;
};

const ROLE_OPTIONS: AccessRoleValue[] = ['guest', 'pro', 'private'];

export function DocsMetadataEditDialog({
  target,
  onClose,
  onSaved,
}: DocsMetadataEditDialogProps) {
  const t = useTranslations('docs.library');
  const titleId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const [draftTitle, setDraftTitle] = useState(target.title);
  const [draftRole, setDraftRole] = useState<AccessRoleValue>(target.accessRole);
  const [applyToArticles, setApplyToArticles] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    inputRef.current?.focus();

    const handleClose = () => {
      // HTMLDialogElement.close() queues the 'close' event asynchronously.
      // In React StrictMode dev remounts, a stale close event from the first
      // cleanup can fire after showModal() reopens the dialog; ignore it while open.
      if (dialog.open) return;
      dialog.returnValue = '';
      onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);

    // Fallback light-dismiss for browsers without native closedby="any" support.
    let cleanupFallback: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== 'undefined' &&
      !('closedBy' in HTMLDialogElement.prototype)
    ) {
      let pressedOutside = false;
      const isOutside = (event: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
      };
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = isOutside(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && isOutside(event) && dialog.open) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
  }, []);

  function requestDismiss() {
    if (isSaving) return;
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === 'function') {
      dialog.close();
    } else {
      onClose();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setErrorMessage(t('edit.titleRequired'));
      return;
    }

    const unchanged =
      trimmedTitle === target.title &&
      draftRole === target.accessRole &&
      (target.targetType !== 'collection' || !applyToArticles);
    if (unchanged) {
      requestDismiss();
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/internal/docs/metadata', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: target.targetType,
          targetId: target.targetId,
          locale: target.locale,
          title: trimmedTitle,
          accessRole: draftRole,
          ...(target.targetType === 'collection' ? { applyToArticles } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        ok?: boolean;
        entry?: DocsMetadataUpdatePayload;
      };
      const updated: DocsMetadataUpdatePayload =
        data.entry ??
        (target.targetType === 'collection'
          ? {
              targetType: 'collection',
              collectionId: target.targetId,
              locale: target.locale,
              title: trimmedTitle,
              accessRole: draftRole,
              updatedDocumentIds: [],
              updatedAt: new Date().toISOString(),
            }
          : {
              targetType: 'document',
              documentId: target.targetId,
              locale: target.locale,
              title: trimmedTitle,
              accessRole: draftRole,
              updatedAt: new Date().toISOString(),
            });
      onSaved(updated);
      const dialog = dialogRef.current;
      if (dialog?.open && typeof dialog.close === 'function') {
        dialog.close();
      } else {
        onClose();
      }
    } catch {
      setErrorMessage(t('edit.saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-[460px] max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-[16px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] p-0 text-[var(--color-text)] shadow-[var(--shadow-nav-dropdown)] [&:modal]:overscroll-contain backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/40 backdrop:backdrop-blur-[2px] dark:backdrop:bg-black/68"
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-faint)] px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            <h1
              id={titleId}
              className="text-[length:var(--text-base)] font-semibold tracking-[-0.015em] text-[var(--color-text)]"
            >
              {target.targetType === 'collection'
                ? t('edit.dialogTitleCollection')
                : t('edit.dialogTitleDocument')}
            </h1>
            <p className="truncate font-mono text-[length:var(--text-2xs)] text-[var(--color-text-subtle)]">
              {target.slug} · {target.locale.toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('actions.cancel')}
            disabled={isSaving}
            onClick={requestDismiss}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor={inputId}
              className="block text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]"
            >
              {t('edit.titleLabel')}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={draftTitle}
              maxLength={200}
              disabled={isSaving}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-bg)] px-3 text-[length:var(--text-sm)] text-[var(--color-text)] outline-none transition-[border-color] focus:border-[var(--color-border-focus,var(--color-border-strong))]"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]">
              {t('edit.accessRoleLabel')}
            </span>
            <div
              role="radiogroup"
              aria-label={t('edit.accessRoleLabel')}
              className="grid grid-cols-3 gap-1.5 rounded-[10px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] p-1"
            >
              {ROLE_OPTIONS.map((role) => {
                const selected = draftRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isSaving}
                    onClick={() => setDraftRole(role)}
                    className={`h-8 cursor-pointer rounded-[7px] px-2 text-[length:var(--text-xs)] font-medium whitespace-nowrap transition-colors ${
                      selected
                        ? 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-card-sm)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {t(`roles.${role}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {target.targetType === 'collection' ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] px-3 py-2.5 text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={applyToArticles}
                disabled={isSaving}
                onChange={(event) => setApplyToArticles(event.target.checked)}
                className="size-3.5 shrink-0 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
              />
              <span>{t('edit.applyToCollectionArticles')}</span>
            </label>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-row-bg)] px-3 py-2 text-[length:var(--text-xs)] text-[var(--color-text)]"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-faint)] px-5 py-3.5">
          <button
            type="button"
            disabled={isSaving}
            onClick={requestDismiss}
            className="h-9 cursor-pointer rounded-[9px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-9 cursor-pointer rounded-[9px] bg-[var(--color-accent)] px-4 text-[length:var(--text-xs)] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? t('actions.saving') : t('actions.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
