import type {
  DocsCalloutTone,
  DocsCalloutVariant,
  DocsCodeVariant,
  DocsDividerVariant,
  DocsHeadingVariant,
  DocsListStyle,
  DocsParagraphSpacing,
  DocsParagraphVariant,
  DocsParagraphWidth,
  DocsQuoteVariant,
} from '../schema';

// 定义文档内容块的预设选项，包含不同类型块的可选值列表，方便在创建和编辑文档内容时使用

// 待修改

export const docsHeadingLevels = [1, 2, 3, 4] as const;

export const docsHeadingVariants = [
  'display',
  'default',
  'compact',
  'subtle',
] as const satisfies readonly DocsHeadingVariant[];

export const docsParagraphVariants = [
  'default',
  'lead',
  'muted',
] as const satisfies readonly DocsParagraphVariant[];

export const docsParagraphWidths = [
  'default',
  'narrow',
  'wide',
] as const satisfies readonly DocsParagraphWidth[];

export const docsParagraphSpacings = [
  'default',
  'relaxed',
] as const satisfies readonly DocsParagraphSpacing[];

export const docsListStyles = [
  'unordered',
  'ordered',
] as const satisfies readonly DocsListStyle[];

export const docsCalloutTones = [
  'note',
  'tip',
  'warning',
] as const satisfies readonly DocsCalloutTone[];

export const docsCalloutVariants = [
  'default',
  'soft',
] as const satisfies readonly DocsCalloutVariant[];

export const docsQuoteVariants = [
  'default',
  'emphasis',
] as const satisfies readonly DocsQuoteVariant[];

export const docsCodeVariants = [
  'block',
  'compact',
] as const satisfies readonly DocsCodeVariant[];

export const docsDividerVariants = [
  'default',
  'spacious',
] as const satisfies readonly DocsDividerVariant[];
