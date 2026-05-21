import type { CSSProperties } from 'react';
import { DocsReferenceShell } from '@/components/layouts/containers/docs-reference-shell';
import type { DocsImportPreviewModel } from '@/features/docs/importer';
import { DocsArticleBody } from '@/features/docs/shared/components/docs-article-body';
import { DocsArticleRightRail } from '@/features/docs/shared/components/docs-article-right-rail';
import { ImportPreviewReviewPanel } from './import-preview-review-panel';

type ImportPreviewFeatureProps = {
  locale: string;
  draftId: string;
  preview: DocsImportPreviewModel;
};

export function ImportPreviewFeature({
  locale,
  draftId,
  preview,
}: ImportPreviewFeatureProps) {
  return (
    <DocsReferenceShell
      className="page-shell-docs-import-preview"
      layoutMode="sidebar"
      style={
        {
          '--docs-sidebar-width': '520px',
          '--docs-shell-max-width': '1820px',
        } as CSSProperties
      }
      sidebar={
        <div className="w-full max-h-[calc(100vh-var(--navbar-height)-3rem)] overflow-y-auto pr-2">
          <ImportPreviewReviewPanel
            locale={locale}
            draftId={draftId}
            preview={preview}
          />
        </div>
      }
      aside={
        <DocsArticleRightRail
          items={preview.draft.page.outline}
          label={preview.draft.page.outlineLabel}
        />
      }
    >
      <div className="space-y-8 lg:space-y-0">
        <div className="import-preview-mobile-review hidden">
          <ImportPreviewReviewPanel
            locale={locale}
            draftId={draftId}
            preview={preview}
          />
        </div>
        <DocsArticleBody page={preview.draft.page} />
      </div>
    </DocsReferenceShell>
  );
}
