import type { DocsImportArticleSource } from '../types';

// 集合文章导入示例：作为导入器功能链的第一个验证样例，保持内容和结构都非常简单，主要用于验证导入器的基本功能和数据库写入的正确性，后续会基于这个样例进行更复杂的写作实验
const articleSource: DocsImportArticleSource = {
  meta: {
    locale: 'en',
    routeType: 'collectionArticle',
    kind: 'article',
    accessRole: 'guest',
    slug: 'importer-sample-shell',
    title: 'Importer sample shell',
    summary: 'A minimal sample used to validate the standard docs article import pipeline.',
    eyebrow: 'Importer sample',
    collectionSlug: 'document-shells',
    collectionTitle: 'Document shells',
    collectionSummary: 'Reusable article shells and structure studies.',
    position: 99,
  },
  body: {
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        description: 'A small imported article used to validate the docs importer MVP chain.',
        blocks: [
          {
            id: 'overview-paragraph',
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This article is authored as a standard TypeScript source file, imported through the docs importer CLI, and previewed through the real docs renderer before it is written into the database. It also references ' },
              { type: 'inlineCode', code: 'pnpm docs:import' },
              { type: 'text', text: ' as the expected entry command for the MVP flow.' },
            ],
            variant: 'default',
            spacing: 'default',
          },
          {
            id: 'overview-callout',
            type: 'callout',
            tone: 'meta',
            title: 'Why this sample exists',
            text: 'The first importer sample should stay intentionally small so the pipeline can be tested without mixing import concerns with large writing experiments.',
            variant: 'default',
          },
        ],
      },
      {
        id: 'checks',
        title: 'Checks',
        blocks: [
          {
            id: 'checks-list',
            type: 'checklist',
            variant: 'default',
            items: [
              {
                id: 'checks-list-1',
                text: 'Confirm the draft loads into import preview.',
                checked: false,
              },
              {
                id: 'checks-list-2',
                text: 'Confirm the collection route is generated correctly after publish.',
                checked: false,
              },
            ],
          },
        ],
      },
    ],
  },
};

export default articleSource;
