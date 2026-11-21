// history: image blocks and local media publishing are implemented; B-05 added tables and equations.

import type { DbDocsInlineContent, DbDocsSectionBlock } from '@incept/db/docs';

/**
 * 定义文档内容块的类型，包括段落、列表、提示、标题、引用、代码块和分割线等不同类型的内容块。
 * 所有块模型与行内模型均直接派生自 `@incept/db/docs` 的 `DbDocsSectionBlock` 存储契约。
 */
export type DocsContentBlockModel = DbDocsSectionBlock;
export type DocsEquationBlockModel = Extract<DbDocsSectionBlock, { type: 'equation' }>;
export type DocsTableBlockModel = Extract<DbDocsSectionBlock, { type: 'table' }>;

export type DocsBlockType = DbDocsSectionBlock['type'];

// 定义不同类型的内容块模型
export type DocsParagraphBlockModel = Extract<DbDocsSectionBlock, { type: 'paragraph' }>;
export type DocsListBlockModel = Extract<DbDocsSectionBlock, { type: 'list' }>;
export type DocsChecklistBlockModel = Extract<DbDocsSectionBlock, { type: 'checklist' }>;
export type DocsChecklistItemModel = DocsChecklistBlockModel['items'][number];
export type DocsCalloutBlockModel = Extract<DbDocsSectionBlock, { type: 'callout' }>;
export type DocsHeadingBlockModel = Extract<DbDocsSectionBlock, { type: 'heading' }>;
export type DocsQuoteBlockModel = Extract<DbDocsSectionBlock, { type: 'quote' }>;
export type DocsCodeBlockModel = Extract<DbDocsSectionBlock, { type: 'code' }>;
export type DocsDividerBlockModel = Extract<DbDocsSectionBlock, { type: 'divider' }>;
export type DocsImageBlockModel = Extract<DbDocsSectionBlock, { type: 'image' }>;

// 标题块的变体
export type DocsHeadingVariant = NonNullable<DocsHeadingBlockModel['variant']>;

// 段落块的变体与行距节奏
export type DocsParagraphVariant = NonNullable<DocsParagraphBlockModel['variant']>;
export type DocsParagraphSpacing = NonNullable<DocsParagraphBlockModel['spacing']>;

// 列表块的列表样式与变体
export type DocsListStyle = NonNullable<DocsListBlockModel['listStyle']>;
export type DocsListVariant = NonNullable<DocsListBlockModel['variant']>;

// 待办列表块的变体
export type DocsChecklistVariant = NonNullable<DocsChecklistBlockModel['variant']>;

// 提示块的语气与变体
export type DocsCalloutTone = DocsCalloutBlockModel['tone'];
export type DocsCalloutVariant = NonNullable<DocsCalloutBlockModel['variant']>;

// 代码块与分割线块的变体
export type DocsCodeVariant = NonNullable<DocsCodeBlockModel['variant']>;
export type DocsDividerVariant = NonNullable<DocsDividerBlockModel['variant']>;

// 定义文档内容块的变体联合类型
export type DocsBlockVariant =
  | DocsHeadingVariant
  | DocsParagraphVariant
  | DocsListVariant
  | DocsChecklistVariant
  | DocsCalloutVariant
  | DocsCodeVariant
  | DocsDividerVariant;

// 定义段落块的行内内容模型，直接派生自数据库存储契约
export type DocsParagraphInlineModel = DbDocsInlineContent;
export type DocsParagraphTextInlineModel = Extract<DbDocsInlineContent, { type: 'text' }>;
export type DocsParagraphLinkInlineModel = Extract<DbDocsInlineContent, { type: 'link' }>;
export type DocsParagraphDeleteInlineModel = Extract<DbDocsInlineContent, { type: 'delete' }>;
export type DocsParagraphMarkInlineModel = Extract<DbDocsInlineContent, { type: 'mark' }>;
export type DocsParagraphInlineCodeInlineModel = Extract<DbDocsInlineContent, { type: 'inlineCode' }>;
