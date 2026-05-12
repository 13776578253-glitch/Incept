import {
  docsCalloutTones,
  docsCalloutVariants,
  docsCodeVariants,
  docsDividerVariants,
  docsHeadingLevels,
  docsHeadingVariants,
  docsListStyles,
  docsParagraphSpacings,
  docsParagraphVariants,
  docsParagraphWidths,
  docsQuoteVariants,
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
  supportedWidths?: readonly string[];
  supportedSpacings?: readonly string[];
  defaultPayload: DocsContentBlockModel;
  examplePayload: DocsContentBlockModel;
  aiUsageHint: string;
};

// 定义文档内容块目录，包含每种类型块的基本信息、支持的选项、默认示例和AI使用提示，方便在文档编辑器中展示和选择不同类型的内容块

// 提供 block 说明 / 待修改 / 测试条目 / 为未来AI生成内容提供提示
export const docsBlockCatalog: DocsBlockCatalogItem[] = [
  {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Standard prose for most document writing.',
    supportedVariants: docsParagraphVariants,
    supportedWidths: docsParagraphWidths,
    supportedSpacings: docsParagraphSpacings,
    defaultPayload: {
      id: 'paragraph-default',
      type: 'paragraph',
      text: 'Use a standard paragraph for calm explanatory writing.',
      variant: 'default',
      width: 'default',
      spacing: 'default',
    },
    examplePayload: {
      id: 'paragraph-lead',
      type: 'paragraph',
      text: 'Lead paragraphs can open a section with slightly more presence while still reading like prose.',
      variant: 'lead',
      width: 'wide',
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
    supportedListStyles: docsListStyles,
    defaultPayload: {
      id: 'list-default',
      type: 'list',
      items: ['First item', 'Second item', 'Third item'],
      listStyle: 'unordered',
    },
    examplePayload: {
      id: 'list-ordered',
      type: 'list',
      items: ['Step one', 'Step two', 'Step three'],
      listStyle: 'ordered',
    },
    aiUsageHint: 'Use for grouped steps, concise comparisons, or distilled takeaways.',
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
    supportedVariants: docsQuoteVariants,
    defaultPayload: {
      id: 'quote-default',
      type: 'quote',
      text: 'A useful docs block system feels editorial before it feels feature-rich.',
      attribution: 'Temporary style note',
      variant: 'default',
    },
    examplePayload: {
      id: 'quote-emphasis',
      type: 'quote',
      text: 'Emphasis quotes should feel more declarative than neutral pull quotes.',
      variant: 'emphasis',
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
