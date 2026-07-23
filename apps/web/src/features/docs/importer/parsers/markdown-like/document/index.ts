import { addMarkdownLikeIssue } from '../errors';
import {
  isMarkdownLikeParagraphBoundary,
  parseMarkdownLikeCallout,
  parseMarkdownLikeChecklist,
  parseMarkdownLikeCode,
  parseMarkdownLikeDivider,
  parseMarkdownLikeHeading,
  parseMarkdownLikeImage,
  parseMarkdownLikeList,
  parseMarkdownLikeParagraph,
  parseMarkdownLikeQuote,
  startMarkdownLikeSection,
} from './blocks';
import { parseMarkdownLikeFrontmatter } from './frontmatter';
import type {
  MarkdownLikeDocumentParseResult,
  MarkdownLikeParseState,
} from './types';

function parseMarkdownLikeBody(
  lines: string[],
  contentStartLine: number,
  initialIssues: MarkdownLikeParseState['issues'],
) {
  // 初始化解析状态
  const state: MarkdownLikeParseState = {
    lines,                             // 当前处理的行数组
    issues: [...initialIssues],        // 复制初始问题，避免修改原数组
    sections: [],                      // 解析出的章节列表
    blockIndex: 0,                     // 全局块序号 / 用于生成唯一 ID
    checklistItemIndex: 0,             // 全局待办项序号
  };

  let index = 0;

  while (index < state.lines.length) {
    const rawLine = state.lines[index];
    const line = rawLine.trim();
    const lineNumber = contentStartLine + index;

    if (!line) {
      index += 1;
      continue;
    }

    // 不支持 HTML 标签 / 以 < 开头
    if (/^<[^>]+>/.test(line)) {
      addMarkdownLikeIssue(
        state.issues,
        lineNumber,
        'unsupported_html',
        'Raw HTML is not supported in markdown-like docs sources.',
      );
      index += 1;
      continue;
    }

    // 暂不支持 Markdown 表格 / 以 | 开头结尾
    if (/^\|.*\|$/.test(line)) {
      addMarkdownLikeIssue(
        state.issues,
        lineNumber,
        'unsupported_syntax',
        'Markdown tables are not supported in markdown-like v1.',
      );
      index += 1;
      continue;
    }

    // 一级标题 / #
    const sectionMatch = line.match(/^#\s+(.+)$/);

    if (sectionMatch) {
      startMarkdownLikeSection(state, sectionMatch[1].trim(), lineNumber);
      index += 1;
      continue;
    }

    // 二级三级及四级标题 / ## / ### / ####
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);

    if (headingMatch) {
      parseMarkdownLikeHeading(
        state,
        headingMatch[1].length as 2 | 3 | 4,
        headingMatch[2].trim(),
        lineNumber,
      );
      index += 1;
      continue;
    }

     // 代码块 / 以 ``` 开始
    if (line.startsWith('```')) {
      index = parseMarkdownLikeCode(state, index);
      continue;
    }

    // 标注块 / 以 :::callout 开始
    if (line.startsWith(':::callout')) {
      index = parseMarkdownLikeCallout(state, index);
      continue;
    }

    // 不支持的标注块 / 以 ::: 开始
    if (line.startsWith(':::')) {
      addMarkdownLikeIssue(
        state.issues,
        lineNumber,
        'unsupported_syntax',
        'Only :::callout containers are supported in markdown-like v1.',
      );
      index += 1;
      continue;
    }

    // 待办事项 / checklist item / 以 - [ ] 或 - [x] 开始
    if (/^\s*-\s+\[[ xX]\]\s+/.test(rawLine)) {
      index = parseMarkdownLikeChecklist(state, index);
      continue;
    }

    // 无序列表 / 以 - 或数字. 开始
    if (/^\s*-\s+/.test(rawLine)) {
      index = parseMarkdownLikeList(state, index, false);
      continue;
    }

    // 有序列表 / 以数字. 开始
    if (/^\s*\d+\.\s+/.test(rawLine)) {
      index = parseMarkdownLikeList(state, index, true);
      continue;
    }

    // 引用块 / 以 > 开始
    if (line.startsWith('>')) {
      index = parseMarkdownLikeQuote(state, index);
      continue;
    }

    // 分隔线 / 以 --- 或 ---{ 开始
    if (line === '---' || /^---\s*\{/.test(line)) {
      parseMarkdownLikeDivider(state, line, lineNumber);
      index += 1;
      continue;
    }

    // 图片 / ![alt](url) 语法
    if (line.startsWith('![')) {
      parseMarkdownLikeImage(state, line, lineNumber);
      index += 1;
      continue;
    }

    // 其余内容视为段落 / Paragraph / 收集连续的非空行，直到遇到下一个块级边界
    const paragraphLines = [line];
    index += 1;

    while (index < state.lines.length && !isMarkdownLikeParagraphBoundary(state.lines[index])) {
      paragraphLines.push(state.lines[index].trim());
      index += 1;
    }

    // 将收集到的段落内容传递给段落解析器 / 将多行合并为一个段落（用空格连接）
    parseMarkdownLikeParagraph(state, paragraphLines.join(' '), lineNumber);
  }

  for (const section of state.sections) {
    if (section.blocks.length === 0) {
      addMarkdownLikeIssue(
        state.issues,
        contentStartLine,
        'empty_section',
        `Section "${section.title}" must contain at least one content block.`,
      );
    }
  }

  return state;
}

export function parseMarkdownLikeDocument(raw: string): MarkdownLikeDocumentParseResult {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const issues: MarkdownLikeParseState['issues'] = [];
  const { frontmatter, contentStartLine } = parseMarkdownLikeFrontmatter(lines, issues);
  const state = parseMarkdownLikeBody(
    lines.slice(contentStartLine - 1),
    contentStartLine,
    issues,
  );

  return {
    document: {
      frontmatter,
      sections: state.sections,
    },
    issues: state.issues,
  };
}
