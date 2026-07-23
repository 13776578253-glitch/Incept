import type { MarkdownLikeParseIssue } from '../errors';

export type MarkdownLikeFrontmatter = Record<string, string>;

export type MarkdownLikeInline =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; href: string; external: boolean }
  | { type: 'inlineCode'; code: string }
  | { type: 'mark'; text: string }
  | { type: 'delete'; text: string };

export type MarkdownLikeHeadingBlock = {
  id: string;
  line: number;
  type: 'heading';
  level: 2 | 3 | 4;
  text: string;
  variant: 'default';
};

export type MarkdownLikeParagraphBlock = {
  id: string;
  line: number;
  type: 'paragraph';
  variant: 'default' | 'lead' | 'muted';
  spacing: 'default' | 'relaxed';
  content: MarkdownLikeInline[];
};

export type MarkdownLikeListBlock = {
  id: string;
  line: number;
  type: 'list';
  listStyle: 'ordered' | 'unordered';
  variant: 'default';
  items: string[];
};

export type MarkdownLikeChecklistBlock = {
  id: string;
  line: number;
  type: 'checklist';
  variant: 'default';
  items: Array<{ id: string; checked: boolean; text: string }>;
};

export type MarkdownLikeQuoteBlock = {
  id: string;
  line: number;
  type: 'quote';
  text: string;
};

export type MarkdownLikeCalloutBlock = {
  id: string;
  line: number;
  type: 'callout';
  tone: 'note' | 'tip' | 'attention' | 'warning' | 'meta';
  title: string;
  text: string;
  variant: 'default' | 'soft' | 'context';
};

export type MarkdownLikeCodeBlock = {
  id: string;
  line: number;
  type: 'code';
  language: string;
  caption?: string;
  variant: 'block' | 'compact';
  code: string;
};

export type MarkdownLikeImageBlock = {
  id: string;
  line: number;
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
};

export type MarkdownLikeDividerBlock = {
  id: string;
  line: number;
  type: 'divider';
  variant: 'default' | 'spacious';
};

export type MarkdownLikeBlock =
  | MarkdownLikeHeadingBlock
  | MarkdownLikeParagraphBlock
  | MarkdownLikeListBlock
  | MarkdownLikeChecklistBlock
  | MarkdownLikeQuoteBlock
  | MarkdownLikeCalloutBlock
  | MarkdownLikeCodeBlock
  | MarkdownLikeImageBlock
  | MarkdownLikeDividerBlock;

export type MarkdownLikeSection = {
  id: string;
  line: number;
  title: string;
  blocks: MarkdownLikeBlock[];
};

export type MarkdownLikeDocument = {
  frontmatter: MarkdownLikeFrontmatter;
  sections: MarkdownLikeSection[];
};

export type MarkdownLikeDocumentParseResult = {
  document: MarkdownLikeDocument;
  issues: MarkdownLikeParseIssue[];
};

export type MarkdownLikeParseState = {
  lines: string[];
  issues: MarkdownLikeParseIssue[];
  sections: MarkdownLikeSection[];
  section?: MarkdownLikeSection;
  blockIndex: number;
  checklistItemIndex: number;
};
