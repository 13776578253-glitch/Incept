import { within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import docs from '../../../messages/zh/docs.json';
import { mapDocsImportSourceToPageModel, toDocsImportPreviewModel } from '../importer/preview-mapper';
import type { DocsImportDraft, DocsImportNormalizedSource } from '../importer/types';
import { ImportPreviewFeature } from './import-preview-feature';

vi.mock('server-only', () => ({}));

function makeSource(slug: string, title: string, position: number): DocsImportNormalizedSource {
  return {
    meta: {
      slug,
      title,
      position,
      locale: 'zh',
      kind: 'article',
      routeType: 'collectionArticle',
      collectionSlug: 'nlp-text-classification',
      collectionTitle: 'NLP 学习笔记',
      layoutMode: 'sidebar',
      accessRole: 'private',
      isListed: true,
      summary: `${title}摘要`,
      publishedAt: '2026-11-15',
    },
    body: {
      sections: [{
        id: `${slug}-section`,
        title: `${title}章节`,
        blocks: [{ id: `${slug}-paragraph`, type: 'paragraph', text: `${title}正文` }],
      }],
    },
  };
}

const first = makeSource('ml-math-foundations', '数学与计算基础', 1);
const second = makeSource('nlp-task-foundations', 'NLP 任务基础', 2);
const draft: DocsImportDraft = {
  id: '329fd371-8658-44c6-8bb6-481e27dcffc2',
  draftType: 'collectionDirectory',
  createdAt: '2026-11-15',
  sourceFilePath: '/docs/nlp-text-classification',
  replace: true,
  source: first,
  issues: [],
  media: { operations: [] },
  page: mapDocsImportSourceToPageModel(first),
  collectionSources: [first, second],
};

it('renders the selected article, outline, and destination within the same replacement draft', () => {
  const preview = toDocsImportPreviewModel(draft, second.meta.slug);
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={{ docs }}>
      <ImportPreviewFeature locale="zh" draftId={draft.id} preview={preview} />
    </NextIntlClientProvider>,
  );

  const view = within(container);
  const batchPath = `/zh/docs/import-preview/${draft.id}`;
  const batchNav = within(view.getAllByRole('navigation', { name: 'Articles in this batch' })[0]);
  expect(batchNav.getByRole('link', { name: /数学与计算基础/ })).toHaveAttribute(
    'href', `${batchPath}?article=${first.meta.slug}`,
  );
  const activeLink = batchNav.getByRole('link', { name: /NLP 任务基础/ });
  expect(activeLink).toHaveAttribute('aria-current', 'page');
  expect(activeLink).toHaveAttribute('href', `${batchPath}?article=${second.meta.slug}`);
  expect(view.getByRole('heading', { name: 'NLP 任务基础' })).toHaveTextContent('NLP 任务基础');
  expect(view.getByText('NLP 任务基础正文')).toBeTruthy();
  expect(view.queryByText('数学与计算基础正文')).toBeNull();
  expect(within(view.getByRole('navigation', { name: 'On this page' }))
    .getByRole('link', { name: 'NLP 任务基础章节' })).toHaveAttribute('href', '#nlp-task-foundations-section');
  expect(view.getAllByText(`/zh/docs/series/nlp-text-classification/${second.meta.slug}`, { exact: false }).length)
    .toBeGreaterThan(0);
  expect(view.getAllByRole('button', { name: 'Confirm batch import' })[0].closest('form'))
    .toHaveAttribute('action', `${batchPath}/confirm`);
  expect(preview.draft).toBe(draft);
});

it('uses the draft’s original article for missing or unknown selections and for a single-article draft', () => {
  expect(toDocsImportPreviewModel(draft).page).toEqual(draft.page);
  expect(toDocsImportPreviewModel(draft, 'unknown').page).toEqual(draft.page);
  expect(toDocsImportPreviewModel({ ...draft, draftType: 'article' }, second.meta.slug).page).toEqual(draft.page);
});

it('resolves linked articles in the draft and preserves fragments and publishable source links', () => {
  const linkedArticle: DocsImportNormalizedSource = {
    ...second,
    body: { sections: [{
      id: 'references',
      title: 'References',
      blocks: [{
        id: 'previous-links',
        type: 'paragraph',
        content: [
          { type: 'link', label: '上一篇', href: './ml-math-foundations' },
          { type: 'link', label: '公式 M0-03', href: './ml-math-foundations#eq-m0-03' },
          { type: 'link', label: '正式路径', href: '/zh/docs/series/nlp-text-classification/ml-math-foundations' },
          { type: 'link', label: '已发布文章', href: './outside-batch#references' },
          { type: 'link', label: '本页', href: '#references' },
          { type: 'link', label: '外部资料', href: 'https://example.com/nlp' },
        ],
      }],
    }] },
  };
  const linkedDraft = { ...draft, collectionSources: [first, linkedArticle] };
  const preview = toDocsImportPreviewModel(linkedDraft, second.meta.slug);
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={{ docs }}>
      <ImportPreviewFeature locale="zh" draftId={draft.id} preview={preview} />
    </NextIntlClientProvider>,
  );
  const article = within(within(container).getByRole('article'));
  expect(article.getByRole('link', { name: '上一篇' })).toHaveAttribute('href', '?article=ml-math-foundations');
  expect(article.getByRole('link', { name: '公式 M0-03' })).toHaveAttribute('href', '?article=ml-math-foundations#eq-m0-03');
  expect(article.getByRole('link', { name: '正式路径' })).toHaveAttribute('href', '?article=ml-math-foundations');
  expect(article.getByRole('link', { name: '已发布文章' })).toHaveAttribute('href', '/zh/docs/series/nlp-text-classification/outside-batch#references');
  expect(article.getByRole('link', { name: '本页' })).toHaveAttribute('href', '#references');
  expect(article.getByRole('link', { name: '外部资料' })).toHaveAttribute('href', 'https://example.com/nlp');
  const sourceBlock = linkedDraft.collectionSources[1].body.sections[0].blocks[0];
  expect(sourceBlock).toMatchObject({ content: [
    { href: './ml-math-foundations' },
    { href: './ml-math-foundations#eq-m0-03' },
    { href: '/zh/docs/series/nlp-text-classification/ml-math-foundations' },
    { href: './outside-batch#references' },
    { href: '#references' },
    { href: 'https://example.com/nlp' },
  ] });
});
