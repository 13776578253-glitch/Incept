import type { DocsImportPreviewModel } from '@/features/docs/importer';

type ImportPreviewReviewPanelProps = {
  locale: string;
  draftId: string;
  preview: DocsImportPreviewModel;
};

function buildRouteDescription(locale: string, preview: DocsImportPreviewModel) {
  return preview.draft.source.meta.routeType === 'collectionArticle'
    ? `/${locale}/docs/series/${preview.draft.source.meta.collectionSlug}/${preview.draft.source.meta.slug}`
    : `/${locale}/docs/${preview.draft.source.meta.slug}`;
}

function buildCollectionDescription(preview: DocsImportPreviewModel) {
  if (preview.draft.source.meta.routeType !== 'collectionArticle') {
    return null;
  }

  return `This draft will be inserted into the "${preview.draft.source.meta.collectionTitle}" collection at position ${preview.draft.source.meta.position}.`;
}

function buildWriteTargetDescription(preview: DocsImportPreviewModel) {
  return preview.draft.source.meta.routeType === 'collectionArticle'
    ? 'Collection article'
    : 'Standalone article';
}

function buildHomepageVisibilityDescription(preview: DocsImportPreviewModel) {
  const accessRole = preview.draft.source.meta.accessRole;

  if (preview.draft.source.meta.routeType === 'collectionArticle') {
    if (accessRole === 'guest') {
      return 'Shown through the collection entry on docs home, not as a separate article row.';
    }

    return `Shown through the collection entry only, and only to ${accessRole} viewers or above.`;
  }

  if (accessRole === 'guest') {
    return 'Appears as a standalone docs home entry for guest viewers.';
  }

  return `Appears as a standalone docs home entry, but only to ${accessRole} viewers or above.`;
}

function buildAccessVisibilityDescription(preview: DocsImportPreviewModel) {
  const accessRole = preview.draft.source.meta.accessRole;

  if (accessRole === 'guest') {
    return 'Visible to all viewers.';
  }

  return `Visible only to ${accessRole} viewers or above.`;
}

export function ImportPreviewReviewPanel({
  locale,
  draftId,
  preview,
}: ImportPreviewReviewPanelProps) {
  const targetLocale = preview.draft.source.meta.locale;
  const routeDescription = buildRouteDescription(targetLocale, preview);
  const collectionDescription = buildCollectionDescription(preview);
  const writeTargetDescription = buildWriteTargetDescription(preview);
  const homepageVisibilityDescription = buildHomepageVisibilityDescription(preview);
  const accessVisibilityDescription = buildAccessVisibilityDescription(preview);

  return (
    <div className="space-y-6 rounded-[1rem] border border-[color:color-mix(in_srgb,var(--color-border)_65%,transparent)] bg-[color:color-mix(in_srgb,var(--color-surface)_96%,transparent)] p-6">
      <div className="space-y-2">
        <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
          Import preview
        </p>
        <h1 className="text-[1.2rem] font-semibold text-[var(--color-text)]">
          {preview.draft.source.meta.title}
        </h1>
        <p className="text-[0.95rem] leading-7 text-[var(--color-text-soft)]">
          Review the normalized article shape before importing it into the docs database.
        </p>
      </div>

      <div className="space-y-3 text-[0.92rem] text-[var(--color-text-muted)]">
        <p className="break-words">
          <span className="font-medium text-[var(--color-text)]">Source file:</span>{' '}
          {preview.draft.sourceFilePath}
        </p>
        <p>
          <span className="font-medium text-[var(--color-text)]">Route type:</span>{' '}
          {preview.draft.source.meta.routeType}
        </p>
        <p>
          <span className="font-medium text-[var(--color-text)]">Target locale:</span>{' '}
          {targetLocale}
        </p>
        <p className="break-words">
          <span className="font-medium text-[var(--color-text)]">Target route:</span>{' '}
          {routeDescription}
        </p>
        {preview.draft.source.meta.routeType === 'collectionArticle' ? (
          <>
            <p>
              <span className="font-medium text-[var(--color-text)]">Collection slug:</span>{' '}
              {preview.draft.source.meta.collectionSlug}
            </p>
            <p>
              <span className="font-medium text-[var(--color-text)]">Collection title:</span>{' '}
              {preview.draft.source.meta.collectionTitle}
            </p>
            <p>
              <span className="font-medium text-[var(--color-text)]">Collection position:</span>{' '}
              {preview.draft.source.meta.position}
            </p>
          </>
        ) : null}
        <p>
          <span className="font-medium text-[var(--color-text)]">Replace existing:</span>{' '}
          {preview.draft.replace ? 'yes' : 'no'}
        </p>
      </div>

      <div className="space-y-3 border-t border-[color:color-mix(in_srgb,var(--color-border)_52%,transparent)] pt-4">
        <p className="text-[0.82rem] font-medium uppercase tracking-[0.16em] text-[var(--color-text-soft)]">
          Post-import visibility
        </p>
        <div className="space-y-3 text-[0.92rem] leading-7 text-[var(--color-text-muted)]">
          <p>
            <span className="font-medium text-[var(--color-text)]">Write target:</span>{' '}
            {writeTargetDescription}
          </p>
          <p className="break-words">
            <span className="font-medium text-[var(--color-text)]">Final route:</span>{' '}
            {routeDescription}
          </p>
          <p>
            <span className="font-medium text-[var(--color-text)]">Homepage visibility:</span>{' '}
            {homepageVisibilityDescription}
          </p>
          <p>
            <span className="font-medium text-[var(--color-text)]">Access visibility:</span>{' '}
            {accessVisibilityDescription}
          </p>
        </div>
      </div>

      {collectionDescription ? (
        <div className="border-t border-[color:color-mix(in_srgb,var(--color-border)_52%,transparent)] pt-4">
          <p className="text-[0.82rem] font-medium uppercase tracking-[0.16em] text-[var(--color-text-soft)]">
            Collection relationship
          </p>
          <p className="mt-2 text-[0.94rem] leading-7 text-[var(--color-text-muted)]">
            {collectionDescription}
          </p>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-[color:color-mix(in_srgb,var(--color-border)_52%,transparent)] pt-4">
        <p className="text-[0.82rem] font-medium uppercase tracking-[0.16em] text-[var(--color-text-soft)]">
          Validation
        </p>
        <p className="text-[0.95rem] text-[var(--color-text-muted)]">
          {preview.errorCount} error(s), {preview.warningCount} warning(s)
        </p>
      </div>

      <div className="space-y-3">
        <form action={`/${locale}/docs/import-preview/${draftId}/confirm`} method="post">
          <button
            type="submit"
            disabled={preview.hasErrors}
            className="inline-flex w-full items-center justify-center rounded-[0.8rem] bg-[var(--color-nav-create-bg)] px-4 py-3 text-[0.95rem] font-medium text-[var(--color-nav-create-text)] transition-colors hover:bg-[var(--color-nav-create-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Confirm import
          </button>
        </form>
        {preview.hasErrors ? (
          <p className="text-[0.88rem] leading-6 text-[var(--color-text-soft)]">
            Fix the source file and re-run the import command before publishing this draft.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {preview.draft.issues.length === 0 ? (
          <p className="text-[0.9rem] leading-7 text-[var(--color-text-soft)]">
            No validation issues were found.
          </p>
        ) : (
          preview.draft.issues.map((issue, index) => (
            <div
              key={`${issue.code}-${index}`}
              className="rounded-[0.8rem] border border-[color:color-mix(in_srgb,var(--color-border)_52%,transparent)] px-4 py-3"
            >
              <p className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
                {issue.level}
              </p>
              <p className="mt-1 text-[0.92rem] leading-7 text-[var(--color-text-muted)]">
                {issue.message}
              </p>
              {issue.path ? (
                <p className="mt-1 break-words text-[0.82rem] text-[var(--color-text-soft)]">
                  {issue.path}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
