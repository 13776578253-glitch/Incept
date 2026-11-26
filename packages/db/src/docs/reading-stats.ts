import type { DbDocsBody, DbDocsInlineContent, DbDocsSectionBlock } from './types';

export type DocsReadingStats = {
  chineseCharacterCount: number;  // 中文字符数（每个汉字计 1）
  wordCount: number;              // 非中文单词数
  writingUnits: number;           // 单元 / 中文字符+单词
  estimatedMinutes: number;       // 预估阅读分钟数 / 至少1分钟
};

function getInlineText(content: DbDocsInlineContent[]) {
  return content.map((item) => {
    switch (item.type) {
      case 'link': return item.label;
      case 'inlineCode': return item.code;
      case 'inlineMath': return '';
      default: return item.text;
    }
  }).join(' ');
}

function getBlockText(block: DbDocsSectionBlock) {
  switch (block.type) {
    case 'paragraph':
      return block.text || getInlineText(block.content ?? []);
    case 'list':
      return block.items.map((item) => typeof item === 'string' ? item : getInlineText(item)).join(' ');
    case 'checklist':
      return block.items.map((item) => item.text).join(' ');
    case 'callout':
      return `${block.title} ${block.text}`;
    case 'heading':
      return block.content ? getInlineText(block.content) : block.text;
    case 'quote': {
      const text = block.content ? getInlineText(block.content) : block.text;
      return `${text} ${block.attribution ?? ''}`;
    }
    case 'image':
    case 'html':
      return block.caption ?? '';
    case 'code':
    case 'divider':
    case 'equation':
      return '';
    case 'table':
      return [block.header, ...block.rows].flat().map(getInlineText).join(' ');
  }
}

/**
 * 计算文档的阅读统计信息
 * 
 * @param title   文档标题
 * @param summary 文档摘要（可选）
 * @param body    文档正文结构（包含章节和块）
 * @returns 阅读统计结果
 */
export function calculateDocsReadingStats({
  title,
  summary,
  body,
}: {
  title: string;
  summary?: string | null;
  body: DbDocsBody;
}): DocsReadingStats {
  const text = [
    title,
    summary ?? '',
    ...body.sections.flatMap((section) => [
      section.title,
      section.description ?? '',
      ...section.blocks.map(getBlockText),
    ]),
  ].join(' ');
  const chineseCharacterCount = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const nonChineseText = text.replace(/\p{Script=Han}/gu, ' ');
  const wordCount = (nonChineseText.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
  const writingUnits = chineseCharacterCount + wordCount;
  const estimatedMinutes = writingUnits
    ? Math.max(1, Math.ceil(chineseCharacterCount / 400 + wordCount / 200))
    : 0;

  return { chineseCharacterCount, wordCount, writingUnits, estimatedMinutes };
}
