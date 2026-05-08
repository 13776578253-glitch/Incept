'use client';

import { useTranslations } from 'next-intl';

import { DocsReferenceShell } from '@/components/layouts/containers/docs-reference-shell';

import { DocsArticleBody } from '@/features/docs/shared/components/docs-article-body';
import { DocsArticleRightRail } from '@/features/docs/shared/components/docs-article-right-rail';
import { DocsArticleSidebar } from '@/features/docs/shared/components/docs-article-sidebar';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';

type DocsArticleFeatureProps = {
  page: DocsArticlePageModel;
};

// 文档文章页功能组件，负责渲染文档内容、侧边栏和右侧大纲等元素
export function DocsArticleFeature({ page }: DocsArticleFeatureProps) {
  const t = useTranslations('docs');

  return (
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
          label={page.outlineLabel || t('reference.outlineLabel')}
        />
      }
    >
      <DocsArticleBody page={page} />
    </DocsReferenceShell>
  );
}
