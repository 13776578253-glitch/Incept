import type { DocsImportArticleSource } from '../../types';

// block格式不完全 /  需要进一步补充
const articleSource: DocsImportArticleSource = {
  meta: {
    // TODO 未来可以考虑新增 documentKey 来标识同一篇文档的不同 locale 版本
    // documentKey: 'docs-page-example-collection',
    locale: 'en',
    routeType: 'collectionArticle',
    kind: 'article',
    layoutMode: 'sidebar',
    accessRole: 'guest',
    slug: 'docs-page-example-collection',
    title: 'Docs page example collection article',
    summary:
      'A copyable collection-article import source that demonstrates every currently supported docs block and inline style inside a collection shell.',
    eyebrow: 'Import template',
    collectionSlug: 'docs-page-example',
    collectionTitle: 'Docs page example',
    collectionSummary: 'A collection used to demonstrate the full docs import source shape.',
    position: 1,
  },
  body: {
    sections: [
      {
        id: 'headings',
        title: 'Heading blocks',
        blocks: [
          {
            id: 'co-heading-display',
            type: 'heading',
            level: 1,
            text: 'Display heading',
            variant: 'display',
          },
          {
            id: 'co-heading-default',
            type: 'heading',
            level: 2,
            text: 'Default heading',
            variant: 'default',
          },
          {
            id: 'co-heading-compact',
            type: 'heading',
            level: 3,
            text: 'Compact heading',
            variant: 'compact',
          },
        ],
      },
      {
        id: 'paragraphs',
        title: 'Paragraph and inline styles',
        blocks: [
          {
            id: 'co-paragraph-inline',
            type: 'paragraph',
            variant: 'default',
            spacing: 'default',
            content: [
              { type: 'text', text: 'Collection articles can still use inline ' },
              {
                type: 'mark',
                text: 'emphasis',
              },
              { type: 'text', text: ', ' },
              {
                type: 'delete',
                text: 'deprecated text',
              },
              { type: 'text', text: ', and ' },
              {
                type: 'inlineCode',
                code: '/en/docs/series/docs-page-example/docs-page-example-collection',
              },
              { type: 'text', text: ' inside prose.' },
            ],
          },
          {
            id: 'co-paragraph-lead',
            type: 'paragraph',
            variant: 'lead',
            spacing: 'relaxed',
            text: 'A lead paragraph can still open a collection article, even when the shell adds a left sidebar.',
          },
        ],
      },
      {
        id: 'lists',
        title: 'List blocks',
        blocks: [
          {
            id: 'co-list-unordered',
            type: 'list',
            listStyle: 'unordered',
            variant: 'default',
            items: [
              'Collection articles should still support standard unordered lists.',
              'The sidebar belongs to the collection, not the list block.',
            ],
          },
          {
            id: 'co-list-ordered',
            type: 'list',
            listStyle: 'ordered',
            variant: 'emphasis',
            items: [
              'Use ordered lists for steps.',
              'Keep collection article content readable.',
            ],
          },
        ],
      },
      {
        id: 'checklists',
        title: 'Checklist blocks',
        blocks: [
          {
            id: 'co-checklist-default',
            type: 'checklist',
            variant: 'default',
            items: [
              {
                id: 'co-checklist-default-1',
                text: 'Confirm the collection sidebar appears.',
                checked: true,
              },
              {
                id: 'co-checklist-default-2',
                text: 'Confirm the current item is active.',
                checked: false,
              },
            ],
          },
        ],
      },
      {
        id: 'callouts',
        title: 'Callout blocks',
        blocks: [
          {
            id: 'co-callout-note',
            type: 'callout',
            tone: 'note',
            title: 'Note',
            text: 'Use note callouts to keep collection-level context visible.',
            variant: 'default',
          },
          {
            id: 'co-callout-warning',
            type: 'callout',
            tone: 'warning',
            title: 'Warning',
            text: 'Use warning callouts when a collection article needs risk framing.',
            variant: 'default',
          },
        ],
      },
      {
        id: 'quotes-dividers-code-images',
        title: 'Quote, divider, code, and image blocks',
        blocks: [
          {
            id: 'co-quote-default',
            type: 'quote',
            text: 'A useful docs block system feels editorial before it feels feature-rich.',
            attribution: 'Collection article note',
          },
          {
            id: 'co-divider-default',
            type: 'divider',
            variant: 'default',
          },
          {
            id: 'co-code-block',
            type: 'code',
            language: 'ts',
            caption: 'Collection article example',
            variant: 'block',
            code: [
              'export const articleSource = {',
              '  meta: { routeType: "collectionArticle" },',
              '  body: { sections: [] },',
              '};',
            ].join('\n'),
          },
          {
            id: 'co-image-default',
            type: 'image',
            src: '/images/docs/style-lab-placeholder.jpg',
            alt: 'Placeholder image used for collection article import template testing.',
            caption: 'Collection articles can also document image usage.',
          },
        ],
      },
    ],
  },
};

export default articleSource;
