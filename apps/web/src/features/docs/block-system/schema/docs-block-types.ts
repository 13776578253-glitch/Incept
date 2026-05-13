// TODO: 可以根据需要增加更多类型的内容块，如图片、表格等
// 目前结构存在缺陷

/**
 * 定义文档内容块的类型，包括段落、列表、提示、标题、引用、代码块和分割线等不同类型的内容块。
 * 这些类型用于前端渲染文档内容，同时也需要与后端数据库中的文档内容结构保持一致。
 */
export type DocsBlockType =
  | 'paragraph'
  | 'list'
  | 'checklist'
  | 'callout'
  | 'heading'
  | 'quote'
  | 'code'
  | 'divider'
  | 'image';

// 标题块的变体
export type DocsHeadingVariant = 'display' | 'default' | 'compact' | 'subtle';

// 段落块的变体
export type DocsParagraphVariant = 'default' | 'lead' | 'muted';

// 段落块的宽度 / 已经不在 block-system 的正式导出面上，也不再被 renderer、catalog、style-lab 或真实 docs 页面使用，暂时保留这个类型定义以备后续可能的使用
// 半保留结构
export type DocsParagraphWidth = 'default' | 'narrow' | 'wide';

// 段落块的行距节奏
export type DocsParagraphSpacing = 'default' | 'relaxed';

// 列表块的列表样式
export type DocsListStyle = 'unordered' | 'ordered';

// 列表块的变体
export type DocsListVariant = 'default' | 'emphasis';

// 待办列表块的变体
export type DocsChecklistVariant = 'default' | 'emphasis';

// 提示块的语气
export type DocsCalloutTone = 'note' | 'tip' | 'attention' | 'warning' | 'meta';

// 引用块的语气
export type DocsCalloutVariant = 'default' | 'soft' | 'context';

// 其他块的变体
export type DocsCodeVariant = 'block' | 'compact';

// 分割线块的变体
export type DocsDividerVariant = 'default' | 'spacious';

// 定义文档内容块的联合类型，包含所有可能的块类型和对应的字段结构
export type DocsBlockVariant =
  | DocsHeadingVariant
  | DocsParagraphVariant
  | DocsListVariant
  | DocsChecklistVariant
  | DocsCalloutVariant
  | DocsCodeVariant
  | DocsDividerVariant;

type DocsBlockBase<TType extends DocsBlockType> = {
  id: string;
  type: TType;
};

// 定义行内文本和链接的模型，用于段落块中的内容表示
export type DocsParagraphTextInlineModel = {
  type: 'text';
  text: string;
};

// 定义行内链接的模型，包含链接文本、URL 和是否为外部链接的标识
export type DocsParagraphLinkInlineModel = {
  type: 'link';
  label: string;
  href: string;
  external?: boolean;
};

export type DocsParagraphDeleteInlineModel = {
  type: 'delete';
  text: string;
};

export type DocsParagraphMarkInlineModel = {
  type: 'mark';
  text: string;
};

export type DocsParagraphInlineCodeInlineModel = {
  type: 'inlineCode';
  code: string;
};

// 定义段落块的行内内容模型，可以是纯文本、链接、删除线、高亮标记或行内代码，使用联合类型表示不同的行内内容结构
export type DocsParagraphInlineModel =
  | DocsParagraphTextInlineModel
  | DocsParagraphLinkInlineModel
  | DocsParagraphDeleteInlineModel
  | DocsParagraphMarkInlineModel
  | DocsParagraphInlineCodeInlineModel;

// 定义不同类型的文档内容块模型，包含对应类型特有的字段，同时继承公共字段
export type DocsParagraphBlockModel = DocsBlockBase<'paragraph'> & {
  text?: string;
  content?: DocsParagraphInlineModel[];
  variant?: DocsParagraphVariant;
  spacing?: DocsParagraphSpacing;
};

// 列表块模型，包含列表项和列表样式
export type DocsListBlockModel = DocsBlockBase<'list'> & {
  items: string[];
  listStyle?: DocsListStyle;
  variant?: DocsListVariant;
};

// 待办列表项模型，包含文本内容和完成状态
export type DocsChecklistItemModel = {
  id: string;
  text: string;
  checked: boolean;
};

// 待办列表块模型，包含待办项和变体
export type DocsChecklistBlockModel = DocsBlockBase<'checklist'> & {
  items: DocsChecklistItemModel[];
  variant?: DocsChecklistVariant;
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

export type DocsImageBlockModel = DocsBlockBase<'image'> & {
  src: string;
  alt: string;
  caption?: string;
};

// 定义文档内容块的联合类型，包含所有具体类型的块模型
export type DocsContentBlockModel =
  | DocsParagraphBlockModel
  | DocsListBlockModel
  | DocsChecklistBlockModel
  | DocsCalloutBlockModel
  | DocsHeadingBlockModel
  | DocsQuoteBlockModel
  | DocsCodeBlockModel
  | DocsDividerBlockModel
  | DocsImageBlockModel;
