import type { DocsImportArticleSource } from '../types';

// 导入器示例文章数据，作为文档导入流程的测试和验证使用，确保整个流程从文件加载、数据规范化、预览展示到最终导入都能正确处理一个标准的文档文章源数据结构
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
