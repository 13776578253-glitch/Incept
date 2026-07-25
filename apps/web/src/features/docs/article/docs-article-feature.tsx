import { DocsReferenceShell } from '@/components/layouts/containers/docs-reference-shell';

import { DocsArticleBody } from '@/features/docs/shared/components/docs-article-body';
import { DocsArticleRightRail } from '@/features/docs/shared/components/docs-article-right-rail';
import { DocsArticleSidebar } from '@/features/docs/shared/components/docs-article-sidebar';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { DocsImportSuccessToast } from './docs-import-success-toast';

type DocsArticleFeatureProps = {
  page: DocsArticlePageModel;
  showImportSuccessToast?: boolean;
  backToListHref?: string;
};

// 文档文章页功能组件，负责渲染文档内容、侧边栏和右侧大纲等元素
export function DocsArticleFeature({
  page,
  showImportSuccessToast = false,
  backToListHref,
}: DocsArticleFeatureProps) {
  const t = useTranslations('docs');

  return (
    <>
      <DocsImportSuccessToast visible={showImportSuccessToast} />
      <DocsReferenceShell
        layoutMode={page.layoutMode}
        sidebar={
          page.layoutMode === 'sidebar' ? (
            <DocsArticleSidebar groups={page.sidebarGroups} />
          ) : undefined
        }
        aside={
          <DocsArticleRightRail
            items={page.outline}
            label="On this page"
          />
        }
      >
        <DocsArticleBody
          page={page}
          backToListHref={backToListHref}
          backToListLabel={backToListHref ? t('reference.backToList') : undefined}
        />
      </DocsReferenceShell>
    </>
  );
}
import { useTranslations } from 'next-intl';
