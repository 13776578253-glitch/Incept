// TODO: 可以根据需要增加更多类型的内容块，如图片、表格等
// 目前结构存在缺陷

/**
 * 定义文档内容块的类型，包括段落、列表、提示、标题、引用、代码块和分割线等不同类型的内容块。
 * 这些类型用于前端渲染文档内容，同时也需要与后端数据库中的文档内容结构保持一致。
 */
export type DocsBlockType =
  | 'paragraph'
  | 'list'
  | 'callout'
  | 'heading'
  | 'quote'
  | 'code'
  | 'divider';

// 标题块的变体
export type DocsHeadingVariant = 'display' | 'default' | 'compact' | 'subtle';

// 段落块的变体
export type DocsParagraphVariant = 'default' | 'lead' | 'muted';

// 段落块的宽度
export type DocsParagraphWidth = 'default' | 'narrow' | 'wide';

// 段落块的行距节奏
export type DocsParagraphSpacing = 'default' | 'relaxed';

// 列表块的列表样式
export type DocsListStyle = 'unordered' | 'ordered';

// 提示块的语气
export type DocsCalloutTone = 'note' | 'tip' | 'warning';

// 引用块的语气
export type DocsCalloutVariant = 'default' | 'soft';

// 提示块的变体
export type DocsQuoteVariant = 'default' | 'emphasis';

// 其他块的变体
export type DocsCodeVariant = 'block' | 'compact';

// 分割线块的变体
export type DocsDividerVariant = 'default' | 'spacious';

// 定义文档内容块的联合类型，包含所有可能的块类型和对应的字段结构
export type DocsBlockVariant =
  | DocsHeadingVariant
  | DocsParagraphVariant
  | DocsCalloutVariant
  | DocsQuoteVariant
  | DocsCodeVariant
  | DocsDividerVariant;

type DocsBlockBase<TType extends DocsBlockType> = {
  id: string;
  type: TType;
};

// 定义不同类型的文档内容块模型，包含对应类型特有的字段，同时继承公共字段
export type DocsParagraphBlockModel = DocsBlockBase<'paragraph'> & {
  text: string;
  variant?: DocsParagraphVariant;
  width?: DocsParagraphWidth;
  spacing?: DocsParagraphSpacing;
};

// 列表块模型，包含列表项和列表样式
export type DocsListBlockModel = DocsBlockBase<'list'> & {
  items: string[];
  listStyle?: DocsListStyle;
};

// 提示块模型，包含语气、标题、文本和变体
export type DocsCalloutBlockModel = DocsBlockBase<'callout'> & {
  tone: DocsCalloutTone;
  title: string;
  text: string;
  variant?: DocsCalloutVariant;
};

// 其他类型的块模型可以按照类似的方式定义，包含对应类型特有的字段和变体选项
export type DocsHeadingBlockModel = DocsBlockBase<'heading'> & {
  level: 1 | 2 | 3 | 4;
  text: string;
  variant?: DocsHeadingVariant;
};

// 引用块模型，包含文本、出处和变体
export type DocsQuoteBlockModel = DocsBlockBase<'quote'> & {
  text: string;
  attribution?: string;
  variant?: DocsQuoteVariant;
};

// 代码块模型，包含代码内容、编程语言、可选的标题和变体
export type DocsCodeBlockModel = DocsBlockBase<'code'> & {
  code: string;
  language: string;
  caption?: string;
  variant?: DocsCodeVariant;
};

// 分割线块模型，包含变体选项
export type DocsDividerBlockModel = DocsBlockBase<'divider'> & {
  variant?: DocsDividerVariant;
};

// 定义文档内容块的联合类型，包含所有具体类型的块模型
export type DocsContentBlockModel =
  | DocsParagraphBlockModel
  | DocsListBlockModel
  | DocsCalloutBlockModel
  | DocsHeadingBlockModel
  | DocsQuoteBlockModel
  | DocsCodeBlockModel
  | DocsDividerBlockModel;
