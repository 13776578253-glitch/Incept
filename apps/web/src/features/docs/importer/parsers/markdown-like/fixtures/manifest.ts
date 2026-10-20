// 合法文档的测试用例
export const validMarkdownLikeFixtures = [
  {
    fileName: 'full-single.docs.md',
    expectedNestedHeading: 'Fine detail',
    expectedSectionIds: ['想法产生', '第二部分'],
    expectedBlockTypes: [
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'list',
      'list',
      'checklist',
      'callout',
      'quote',
      'divider',
      'code',
      'image',
      'paragraph',
    ],
    expectedSource: {
      locale: 'zh',
      slug: 'markdown-like-fixture',
      documentKey: 'markdown-like-fixture',
      accessRole: 'private',
      routeType: 'singleArticle',
      collectionKey: undefined,
      collectionSlug: undefined,
      position: undefined,
    },
  },
  {
    fileName: 'collection-article.docs.md',
    expectedNestedHeading: undefined,
    expectedSectionIds: ['collection-opening'],
    expectedBlockTypes: ['paragraph', 'heading', 'callout', 'image'],
    expectedSource: {
      locale: 'zh',
      slug: 'collection-fixture-article',
      documentKey: 'markdown-like-collection-fixture-article',
      accessRole: 'pro',
      routeType: 'collectionArticle',
      collectionKey: 'markdown-like-collection-fixture',
      collectionSlug: 'markdown-like-collection-zh',
      position: 1,
    },
  },
] as const;

// 非法文档的测试用例 / 用于验证错误检测能力
export const invalidMarkdownLikeFixtures = [
  {
    fileName: 'missing-frontmatter.docs.md',
    expectedIssues: [{ code: 'missing_frontmatter', line: 1 }],
  },
  {
    fileName: 'unsupported-container.docs.md',
    expectedIssues: [
      { code: 'unsupported_syntax', line: 10 },
      { code: 'unsupported_syntax', line: 12 },
    ],
  },
  {
    fileName: 'unclosed-callout.docs.md',
    expectedIssues: [
      { code: 'unclosed_callout', line: 4 },
      { code: 'empty_section', line: 7 },
    ],
  },
  {
    fileName: 'unclosed-code.docs.md',
    expectedIssues: [
      { code: 'unclosed_code_fence', line: 4 },
      { code: 'empty_section', line: 7 },
    ],
  },
  {
    fileName: 'invalid-image.docs.md',
    expectedIssues: [{ code: 'invalid_image', line: 10 }],
  },
  {
    fileName: 'empty-section.docs.md',
    expectedIssues: [{ code: 'empty_section', line: 7 }],
  },
  {
    fileName: 'unsupported-emphasis.docs.md',
    expectedIssues: [
      { code: 'unsupported_syntax', line: 10 },
      { code: 'unsupported_syntax', line: 10 },
    ],
  },
  {
    fileName: 'collection-missing-key.docs.md',
    expectedIssues: [{ code: 'missing_frontmatter_field', line: 1 }],
  },
  {
    fileName: 'collection-invalid-position.docs.md',
    expectedIssues: [{ code: 'invalid_frontmatter', line: 1 }],
  },
] as const;
