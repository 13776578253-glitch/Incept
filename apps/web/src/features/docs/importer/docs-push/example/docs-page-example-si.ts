import type { DocsImportArticleSource } from '../../types';

// TODO 新增一个 canonicalKey 或 documentKey：

// meta: {
//   documentKey: 'my-article',
//   locale: 'en',
//   slug: 'my-article',
// }
// meta: {
//   documentKey: 'my-article',
//   locale: 'zh',
//   slug: 'my-article',
// }

// 导入逻辑用：documentKey 来定位同一个 docs_documents，再往下面 upsert 不同 locale 行。
// 一个 document
//   - en locale
//   - zh locale

const articleSource: DocsImportArticleSource = {
  meta: {
    // TODO 未来可以考虑新增 documentKey 来标识同一篇文档的不同 locale 版本
    locale: 'en',
    routeType: 'singleArticle',
    kind: 'article',
    layoutMode: 'contentOnly',
    accessRole: 'guest',
    slug: 'docs-page-example-single',
    title: 'Docs page example single article',
    summary:
      'A copyable single-article import source that demonstrates every currently supported docs block and inline style.',
    eyebrow: 'Import template',
  },
  body: {
    sections: [
      {
        id: 'headings',
        title: 'Heading blocks',
        description: 'Use heading blocks inside a section when the section needs internal structure.',
        blocks: [
          {
            id: 'heading-display',
            type: 'heading',
            level: 1,
            text: 'Display heading',
            variant: 'display',
          },
          {
            id: 'heading-default',
            type: 'heading',
            level: 2,
            text: 'Default heading',
            variant: 'default',
          },
          {
            id: 'heading-compact',
            type: 'heading',
            level: 3,
            text: 'Compact heading',
            variant: 'compact',
          },
          {
            id: 'heading-subtle',
            type: 'heading',
            level: 4,
            text: 'Subtle heading',
            variant: 'subtle',
          },
        ],
      },
      {
        id: 'paragraphs',
        title: 'Paragraph and inline styles',
        description: 'Paragraphs can use plain text or structured inline content.',
        blocks: [
          {
            id: 'paragraph-lead',
            type: 'paragraph',
            variant: 'lead',
            spacing: 'relaxed',
            text: 'Lead paragraphs open a section with more presence and a slightly calmer rhythm.',
          },
          {
            id: 'paragraph-default-inline',
            type: 'paragraph',
            variant: 'default',
            spacing: 'default',
            content: [
              {
                type: 'text',
                text: 'A paragraph can include ordinary text, ',
              },
              {
                type: 'link',
                label: 'an inline link',
                href: 'https://openai.com',
                external: true,
              },
              {
                type: 'text',
                text: ', ',
              },
              {
                type: 'mark',
                text: 'marked emphasis',
              },
              {
                type: 'text',
                text: ', ',
              },
              {
                type: 'delete',
                text: 'deprecated phrasing',
              },
              {
                type: 'text',
                text: ', and ',
              },
              {
                type: 'inlineCode',
                code: 'inlineCode',
              },
              {
                type: 'text',
                text: ' without becoming multiple blocks.',
              },
            ],
          },
          {
            id: 'paragraph-muted',
            type: 'paragraph',
            variant: 'muted',
            spacing: 'default',
            text: 'Muted paragraphs are useful for secondary explanation, caveats, or lower-priority context.',
          },
        ],
      },
      {
        id: 'lists',
        title: 'List blocks',
        blocks: [
          {
            id: 'list-unordered-default',
            type: 'list',
            listStyle: 'unordered',
            variant: 'default',
            items: [
              'Use unordered lists for grouped points.',
              'Keep each item concise enough to scan.',
              'Longer items are allowed when the paragraph rhythm would be too heavy.',
            ],
          },
          {
            id: 'list-ordered-emphasis',
            type: 'list',
            listStyle: 'ordered',
            variant: 'emphasis',
            items: [
              'Use ordered lists for steps.',
              'Keep action order explicit.',
              'Review wrapping and marker alignment in preview.',
            ],
          },
        ],
      },
      {
        id: 'checklists',
        title: 'Checklist blocks',
        blocks: [
          {
            id: 'checklist-default',
            type: 'checklist',
            variant: 'default',
            items: [
              {
                id: 'checklist-default-1',
                text: 'Confirm the import source validates.',
                checked: true,
              },
              {
                id: 'checklist-default-2',
                text: 'Confirm the preview route renders correctly.',
                checked: false,
              },
            ],
          },
          {
            id: 'checklist-emphasis',
            type: 'checklist',
            variant: 'emphasis',
            items: [
              {
                id: 'checklist-emphasis-1',
                text: 'Use emphasis checklists when the tasks need stronger visual presence.',
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
            id: 'callout-note',
            type: 'callout',
            tone: 'note',
            title: 'Note',
            text: 'Use note callouts for neutral supporting context.',
            variant: 'default',
          },
          {
            id: 'callout-tip-soft',
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Use soft tips for teaching-oriented guidance.',
            variant: 'soft',
          },
          {
            id: 'callout-tip-context',
            type: 'callout',
            tone: 'tip',
            title: 'Context',
            text: 'Use context tips for explanatory background.',
            variant: 'context',
          },
          {
            id: 'callout-attention',
            type: 'callout',
            tone: 'attention',
            title: 'Attention',
            text: 'Use attention for mild caveats that should be noticed.',
            variant: 'default',
          },
          {
            id: 'callout-warning',
            type: 'callout',
            tone: 'warning',
            title: 'Warning',
            text: 'Use warning for concrete risk or likely failure.',
            variant: 'default',
          },
          {
            id: 'callout-meta',
            type: 'callout',
            tone: 'meta',
            title: 'Metadata',
            text: 'Use meta callouts for article-level context such as reading time or format notes.',
            variant: 'default',
          },
        ],
      },
      {
        id: 'quotes-dividers-code-images',
        title: 'Quote, divider, code, and image blocks',
        blocks: [
          {
            id: 'quote-default',
            type: 'quote',
            text: 'A useful docs block system feels editorial before it feels feature-rich.',
            attribution: 'Docs style note',
          },
          {
            id: 'divider-default',
            type: 'divider',
            variant: 'default',
          },
          {
            id: 'divider-spacious',
            type: 'divider',
            variant: 'spacious',
          },
          {
            id: 'code-block',
            type: 'code',
            language: 'ts',
            caption: 'Default TypeScript block',
            variant: 'block',
            code: [
              'type DocsImportArticleSource = {',
              '  meta: DocsImportArticleMeta;',
              '  body: DocsImportArticleBody;',
              '};',
            ].join('\n'),
          },
          {
            id: 'code-compact',
            type: 'code',
            language: 'bash',
            caption: 'Compact command block',
            variant: 'compact',
            code: 'pnpm docs:import --file <path>',
          },
          {
            id: 'image-default',
            type: 'image',
            src: '/images/docs/style-lab-placeholder.jpg',
            alt: 'Placeholder image used for docs import template testing.',
            caption: 'Image blocks should use real screenshots or meaningful visual references in production.',
          },
        ],
      },
    ],
  },
};

export default articleSource;
