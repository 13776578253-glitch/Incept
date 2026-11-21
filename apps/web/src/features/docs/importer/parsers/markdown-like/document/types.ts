import type {
  DocsCalloutBlockModel,
  DocsCalloutVariant,
  DocsChecklistBlockModel,
  DocsCodeBlockModel,
  DocsCodeVariant,
  DocsDividerBlockModel,
  DocsDividerVariant,
  DocsEquationBlockModel,
  DocsHeadingBlockModel,
  DocsImageBlockModel,
  DocsListBlockModel,
  DocsListStyle,
  DocsParagraphBlockModel,
  DocsParagraphInlineModel,
  DocsParagraphLinkInlineModel,
  DocsParagraphSpacing,
  DocsParagraphVariant,
  DocsQuoteBlockModel,
  DocsTableBlockModel,
} from '../../../../block-system/schema';
import type { MarkdownLikeParseIssue } from '../errors';

export type MarkdownLikeFrontmatter = Record<string, string>;

type WithParserLine<TBlock, TOverrides = Record<never, never>> = Omit<
  TBlock,
  keyof TOverrides
> &
  TOverrides & {
    line: number;
  };

export type MarkdownLikeInline =
  | Exclude<DocsParagraphInlineModel, { type: 'link' }>
  | (Omit<DocsParagraphLinkInlineModel, 'external'> & { external: boolean });

export type MarkdownLikeHeadingBlock = WithParserLine<
  DocsHeadingBlockModel,
  {
    level: 2 | 3 | 4;
    variant: 'default';
  }
>;

export type MarkdownLikeParagraphBlock = WithParserLine<
  Omit<DocsParagraphBlockModel, 'text'>,
  {
    variant: DocsParagraphVariant;
    spacing: DocsParagraphSpacing;
    content: MarkdownLikeInline[];
  }
>;

export type MarkdownLikeListBlock = WithParserLine<
  DocsListBlockModel,
  {
    listStyle: DocsListStyle;
    variant: 'default';
  }
>;

export type MarkdownLikeChecklistBlock = WithParserLine<
  DocsChecklistBlockModel,
  {
    variant: 'default';
  }
>;

export type MarkdownLikeQuoteBlock = WithParserLine<
  Omit<DocsQuoteBlockModel, 'attribution'>
>;

export type MarkdownLikeCalloutBlock = WithParserLine<
  DocsCalloutBlockModel,
  {
    variant: DocsCalloutVariant;
  }
>;

export type MarkdownLikeCodeBlock = WithParserLine<
  DocsCodeBlockModel,
  {
    variant: DocsCodeVariant;
  }
>;

export type MarkdownLikeImageBlock = WithParserLine<DocsImageBlockModel>;

export type MarkdownLikeDividerBlock = WithParserLine<
  DocsDividerBlockModel,
  {
    variant: DocsDividerVariant;
  }
>;

export type MarkdownLikeBlock =
  | MarkdownLikeHeadingBlock
  | MarkdownLikeParagraphBlock
  | MarkdownLikeListBlock
  | MarkdownLikeChecklistBlock
  | MarkdownLikeQuoteBlock
  | MarkdownLikeCalloutBlock
  | MarkdownLikeCodeBlock
  | MarkdownLikeImageBlock
  | MarkdownLikeDividerBlock
  | WithParserLine<DocsEquationBlockModel>
  | WithParserLine<DocsTableBlockModel>;

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
  equationIds: Set<string>;
};
