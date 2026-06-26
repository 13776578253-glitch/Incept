import type { DocsImportArticleSource } from '../../types';

const articleSource: DocsImportArticleSource = {
  meta: {
    locale: 'en',
    routeType: 'singleArticle',
    kind: 'article',
    layoutMode: 'contentOnly',
    accessRole: 'guest',
    slug: 'standalone-import-sample',
    // 标题
    title: 'Standalone import sample',
    // 简述
    summary: 'A compact standalone article used to validate the single-article docs import path.',
    // 眉目
    eyebrow: 'Standalone sample',
  },
  body: {
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        description: 'A small standalone article that should appear as its own docs home entry after import.',
        blocks: [
          {
            id: 'overview-paragraph',
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This sample exists to validate the standalone article path, where a standard TypeScript source file is imported, previewed, published, and then listed as its own entry on docs home.',
              },
            ],
            variant: 'default',
            spacing: 'default',
          },
          {
            id: 'overview-callout',
            type: 'callout',
            tone: 'meta',
            title: 'Why this sample matters',
            text: 'Collection articles prove sidebar placement. This standalone sample proves homepage visibility, direct routing, and content-only shell rendering.',
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
                text: 'Confirm the preview route renders with no collection sidebar.',
                checked: false,
              },
              {
                id: 'checks-list-2',
                text: 'Confirm the final article appears as a standalone docs home entry after publish.',
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
