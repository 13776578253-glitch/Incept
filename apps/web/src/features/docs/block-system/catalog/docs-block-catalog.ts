import {
  docsCalloutTones,
  docsCalloutVariants,
  docsChecklistVariants,
  docsCodeVariants,
  docsDividerVariants,
  docsHeadingLevels,
  docsHeadingVariants,
  docsListStyles,
  docsListVariants,
  docsParagraphSpacings,
  docsParagraphVariants,
} from '../presets';
import type {
  DocsBlockType,
  DocsBlockVariant,
  DocsContentBlockModel,
} from '../schema';

export type DocsBlockCatalogItem = {
  type: DocsBlockType;
  label: string;
  description: string;
  supportedVariants?: readonly DocsBlockVariant[];
  supportedLevels?: readonly number[];
  supportedTones?: readonly string[];
  supportedListStyles?: readonly string[];
  supportedSpacings?: readonly string[];
  defaultPayload: DocsContentBlockModel;
  examplePayload: DocsContentBlockModel;
  aiUsageHint: string;
};

// 定义文档内容块目录，包含每种类型块的基本信息、支持的选项、默认示例和AI使用提示，方便在文档编辑器中展示和选择不同类型的内容块

// 提供 block 说明 / 待修改 / 测试条目 / 为未来AI生成内容提供提示
// TODO: image block 后续需要补真实照片 / 真实截图测试，当前 catalog 中的 data:image 主要只是占位图，用来先验证壳层、边框和 caption 节奏，不能替代真实视觉素材测试。
export const docsBlockCatalog: DocsBlockCatalogItem[] = [
  {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Standard prose for most document writing.',
    supportedVariants: docsParagraphVariants,
    supportedSpacings: docsParagraphSpacings,
    defaultPayload: {
      id: 'paragraph-default',
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Use a standard paragraph for calm explanatory writing, and ' },
        {
          type: 'link',
          label: 'attach links inline',
          href: 'https://example.com/docs-link-pattern',
          external: true,
        },
        { type: 'text', text: ' without forcing a separate block. You can also ' },
        { type: 'mark', text: 'mark important phrases' },
        { type: 'text', text: ' or keep a ' },
        { type: 'delete', text: 'deprecated line' },
        { type: 'text', text: ' inline when the sentence needs revision history. Mention ' },
        { type: 'inlineCode', code: 'layoutMode' },
        { type: 'text', text: ' the same way when the sentence references a field or command.' },
      ],
      variant: 'default',
      spacing: 'default',
    },
    examplePayload: {
      id: 'paragraph-lead',
      type: 'paragraph',
      text: 'Lead paragraphs can open a section with slightly more presence while still reading like prose.',
      variant: 'lead',
      spacing: 'relaxed',
    },
    aiUsageHint: 'Use for explanation, transitions, and long-form narrative content.',
  },
  {
    type: 'heading',
    label: 'Heading',
    description: 'Body-level heading used inside a section.',
    supportedVariants: docsHeadingVariants,
    supportedLevels: [...docsHeadingLevels],
    defaultPayload: {
      id: 'heading-default',
      type: 'heading',
      level: 2,
      text: 'Body heading',
      variant: 'default',
    },
    examplePayload: {
      id: 'heading-display',
      type: 'heading',
      level: 1,
      text: 'Display heading variant',
      variant: 'display',
    },
    aiUsageHint: 'Use to break down a section into smaller internal reading units.',
  },
  {
    type: 'list',
    label: 'List',
    description: 'Ordered or unordered sequence of short points.',
    supportedVariants: docsListVariants,
    supportedListStyles: docsListStyles,
    defaultPayload: {
      id: 'list-default',
      type: 'list',
      items: ['First item', 'Second item', 'Third item'],
      listStyle: 'unordered',
      variant: 'default',
    },
    examplePayload: {
      id: 'list-ordered',
      type: 'list',
      items: ['Step one', 'Step two', 'Step three'],
      listStyle: 'ordered',
      variant: 'emphasis',
    },
    aiUsageHint: 'Use for grouped steps, concise comparisons, or distilled takeaways.',
  },
  {
    type: 'checklist',
    label: 'Checklist',
    description: 'Task list with completed and incomplete states.',
    supportedVariants: docsChecklistVariants,
    defaultPayload: {
      id: 'checklist-default',
      type: 'checklist',
      variant: 'default',
      items: [
        {
          id: 'checklist-default-1',
          text: 'Confirm the task line wraps cleanly in the standard reading shell.',
          checked: false,
        },
        {
          id: 'checklist-default-2',
          text: 'Keep one item completed so the checked state can be reviewed alongside the pending state.',
          checked: true,
        },
      ],
    },
    examplePayload: {
      id: 'checklist-emphasis',
      type: 'checklist',
      variant: 'emphasis',
      items: [
        {
          id: 'checklist-emphasis-1',
          text: 'Use the emphasis variant when the task list should read more like an active priority surface.',
          checked: false,
        },
        {
          id: 'checklist-emphasis-2',
          text: 'Keep a completed item here too so stronger typography can be checked together with the finished-state treatment.',
          checked: true,
        },
      ],
    },
    aiUsageHint: 'Use for task tracking, open checklists, or progress-oriented notes with explicit completion state.',
  },
  {
    type: 'callout',
    label: 'Callout',
    description: 'Highlighted note, tip, or warning block.',
    supportedVariants: docsCalloutVariants,
    supportedTones: docsCalloutTones,
    defaultPayload: {
      id: 'callout-default',
      type: 'callout',
      tone: 'note',
      title: 'Note',
      text: 'Use a callout to draw attention without breaking the document structure.',
      variant: 'default',
    },
    examplePayload: {
      id: 'callout-soft',
      type: 'callout',
      tone: 'tip',
      title: 'Soft tip',
      text: 'A softer variant can carry guidance without becoming visually dominant.',
      variant: 'soft',
    },
    aiUsageHint: 'Use for important side notes, cautions, or implementation tips.',
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Quoted or emphasized passage with optional attribution.',
    defaultPayload: {
      id: 'quote-default',
      type: 'quote',
      text: 'A useful docs block system feels editorial before it feels feature-rich.',
      attribution: 'Temporary style note',
    },
    examplePayload: {
      id: 'quote-example',
      type: 'quote',
      text: 'Quotes should isolate a sentence cleanly without turning into a separate visual system.',
      attribution: 'Temporary style note',
    },
    aiUsageHint: 'Use for quoted material or short high-signal statements that deserve isolation.',
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Code block with language and optional caption.',
    supportedVariants: docsCodeVariants,
    defaultPayload: {
      id: 'code-default',
      type: 'code',
      code: "const block = { type: 'code', language: 'ts' };",
      language: 'ts',
      caption: 'Default block code',
      variant: 'block',
    },
    examplePayload: {
      id: 'code-compact',
      type: 'code',
      code: 'pnpm db:seed',
      language: 'bash',
      caption: 'Compact command example',
      variant: 'compact',
    },
    aiUsageHint: 'Use for code samples, commands, or structured syntax that must retain formatting.',
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Standalone image block with optional caption.',
    defaultPayload: {
      id: 'image-default',
      type: 'image',
      src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22720%22 height=%22432%22 viewBox=%220 0 720 432%22 fill=%22none%22%3E%3Crect width=%22720%22 height=%22432%22 fill=%22%23f4f4f4%22/%3E%3Crect x=%2238%22 y=%2240%22 width=%22212%22 height=%2218%22 rx=%229%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%2238%22 y=%2278%22 width=%22644%22 height=%2214%22 rx=%227%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%2238%22 y=%22104%22 width=%22596%22 height=%2214%22 rx=%227%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%2238%22 y=%22148%22 width=%22184%22 height=%22130%22 rx=%2214%22 fill=%22%23e7e7e7%22/%3E%3Crect x=%22248%22 y=%22148%22 width=%22434%22 height=%2218%22 rx=%229%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%22248%22 y=%22180%22 width=%22388%22 height=%2214%22 rx=%227%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%22248%22 y=%22206%22 width=%22410%22 height=%2214%22 rx=%227%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3Crect x=%22248%22 y=%22242%22 width=%22170%22 height=%2216%22 rx=%228%22 fill=%22%23171717%22 fill-opacity=%220.08%22/%3E%3C/svg%3E',
      alt: 'Sample interface preview placeholder',
      caption: 'Default image block caption',
    },
    examplePayload: {
      id: 'image-example',
      type: 'image',
      src: 'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22720%22 height=%22432%22 viewBox=%220 0 720 432%22 fill=%22none%22%3E%3Crect width=%22720%22 height=%22432%22 fill=%22%231f1f1f%22/%3E%3Crect x=%2240%22 y=%2244%22 width=%22212%22 height=%2218%22 rx=%229%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3Crect x=%2240%22 y=%2284%22 width=%22584%22 height=%2214%22 rx=%227%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3Crect x=%2240%22 y=%22110%22 width=%22524%22 height=%2214%22 rx=%227%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3Crect x=%2240%22 y=%22160%22 width=%22640%22 height=%2298%22 rx=%2216%22 fill=%22%23272727%22/%3E%3Crect x=%2270%22 y=%22188%22 width=%22156%22 height=%2216%22 rx=%228%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3Crect x=%2270%22 y=%22218%22 width=%22382%22 height=%2214%22 rx=%227%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3Crect x=%2270%22 y=%22244%22 width=%22324%22 height=%2214%22 rx=%227%22 fill=%22%23ffffff%22 fill-opacity=%220.1%22/%3E%3C/svg%3E',
      alt: 'Alternative dark placeholder preview',
      caption: 'Example image block caption',
    },
    aiUsageHint: 'Use for screenshots, diagrams, and visual references that should stand as standalone content blocks.',
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Visual rhythm separator between content groups.',
    supportedVariants: docsDividerVariants,
    defaultPayload: {
      id: 'divider-default',
      type: 'divider',
      variant: 'default',
    },
    examplePayload: {
      id: 'divider-spacious',
      type: 'divider',
      variant: 'spacious',
    },
    aiUsageHint: 'Use sparingly to separate major transitions in long-form content.',
  },
];
