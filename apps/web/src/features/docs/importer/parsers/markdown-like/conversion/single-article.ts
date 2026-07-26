import type {
  DocsCalloutVariant,
  DocsCodeVariant,
  DocsContentBlockModel,
  DocsParagraphInlineModel,
  DocsParagraphSpacing,
  DocsParagraphVariant,
} from '@/features/docs/block-system/schema';

import type { DocsAccessRole, DocsLayoutMode } from '@/features/docs/shared/types';

import type { DocsImportArticleSource, DocsImportKind } from '../../../types';
import type {
  MarkdownLikeBlock,
  MarkdownLikeDocument,
  MarkdownLikeInline,
} from '../document/types';

/**
 * 将类 Markdown 解析出的内联元素转换为最终文档模型的内联元素
 * 当前版本中，两种结构完全一致，直接返回。
 */
function toDocsParagraphInline(inline: MarkdownLikeInline): DocsParagraphInlineModel {
  return inline;
}

/**
 * 将类 Markdown 解析出的内容块转换为最终文档模型的内容块
 * 根据块类型进行字段映射和类型断言，确保结构符合 DocsContentBlockModel 的联合类型
 */
function toDocsContentBlock(block: MarkdownLikeBlock): DocsContentBlockModel {
  switch (block.type) {
    case 'heading':
      return {
        id: block.id,
        type: 'heading',
        level: block.level,
        text: block.text,
        variant: block.variant,
      };
    case 'paragraph':
      return {
        id: block.id,
        type: 'paragraph',
        variant: block.variant as DocsParagraphVariant,
        spacing: block.spacing as DocsParagraphSpacing,
        content: block.content.map(toDocsParagraphInline),
      };
    case 'list':
      return {
        id: block.id,
        type: 'list',
        listStyle: block.listStyle,
        variant: block.variant,
        items: block.items,
      };
    case 'checklist':
      return {
        id: block.id,
        type: 'checklist',
        variant: block.variant,
        items: block.items,
      };
    case 'quote':
      return {
        id: block.id,
        type: 'quote',
        text: block.text,
      };
    case 'callout':
      return {
        id: block.id,
        type: 'callout',
        tone: block.tone,
        title: block.title,
        text: block.text,
        variant: block.variant as DocsCalloutVariant,
      };
    case 'code':
      return {
        id: block.id,
        type: 'code',
        language: block.language,
        caption: block.caption,
        variant: block.variant as DocsCodeVariant,
        code: block.code,
      };
    case 'image':
      return {
        id: block.id,
        type: 'image',
        src: block.src,
        alt: block.alt,
        caption: block.caption,
      };
    case 'divider':
      return {
        id: block.id,
        type: 'divider',
        variant: block.variant,
      };
  }
}

export function toDocsArticleBody(document: MarkdownLikeDocument): DocsImportArticleSource['body'] {
  return {
    sections: document.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks.map(toDocsContentBlock),
    })),
  };
}

export function toSingleArticleDocsImportSource(document: MarkdownLikeDocument): DocsImportArticleSource {
  const { frontmatter } = document;

  return {
    meta: {
      documentKey: frontmatter.documentKey,
      locale: frontmatter.locale as DocsImportArticleSource['meta']['locale'],
      routeType: 'singleArticle',
      kind: (frontmatter.kind as DocsImportKind | undefined) ?? 'article',
      layoutMode: (frontmatter.layoutMode as DocsLayoutMode | undefined) ?? 'contentOnly',
      accessRole: (frontmatter.accessRole as DocsAccessRole | undefined) ?? 'guest',
      isListed: frontmatter.isListed !== 'false',
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      eyebrow: frontmatter.eyebrow,
      seoTitle: frontmatter.seoTitle,
      seoDescription: frontmatter.seoDescription,
      publishedAt: frontmatter.publishedAt,
    },
    body: toDocsArticleBody(document),
  };
}
