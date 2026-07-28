import { slugifyMarkdownLikeId } from '../ids';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState, MarkdownLikeSection } from '../types';

// 重导出各区块解析器
export { parseMarkdownLikeCode } from './code';
export { parseMarkdownLikeCallout, parseMarkdownLikeDivider, parseMarkdownLikeQuote } from './editorial';
export { parseMarkdownLikeImage } from './image';
export { parseMarkdownLikeChecklist, parseMarkdownLikeList } from './lists';
export { parseMarkdownLikeParagraph } from './paragraph';

// history: # creates a section and ## through #### already parse as body heading blocks.
// TODO: When nested On this page navigation is added, map heading blocks into the outline without changing section IDs or article-writing syntax.

/**
 * 开始一个新章节（section），由一级标题 / # 标题文本 触发。
 * 会基于标题文本生成 slug 化的 id，设置到解析状态中作为“当前章节”，并加入章节列表。
 *
 * @param state 解析器全局状态
 * @param title 章节标题（# 后面的部分，已去除首尾空格）
 * @param line  当前行号（1-based）
 * @returns 新创建的章节对象
 */
export function startMarkdownLikeSection(
  state: MarkdownLikeParseState,
  title: string,
  line: number,
): MarkdownLikeSection {
  const section: MarkdownLikeSection = {
    id: slugifyMarkdownLikeId(title),  // 将标题转换成 URL 安全的 id，空标题会得到 "section"
    line,
    title,
    blocks: [],  // 后续解析的内容块会追加到此数组
  };
  state.section = section;      // 标记为当前正在处理的章节
  state.sections.push(section); // 加入章节列表

  return section;
}

export function parseMarkdownLikeHeading(
  state: MarkdownLikeParseState,
  level: 2 | 3 | 4,
  text: string,
  line: number,
) {
  const section = ensureMarkdownLikeSection(state, line);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'heading', text),
    line,
    type: 'heading',
    level,
    text,
    variant: 'default',
  });
}


/**
 * 判断某一行是否为段落边界 / 即当前段落应在此行之前结束
 *
 * - 空行
 * - 任何级别的标题（#、##、###、####）
 * - 代码围栏（```）
 * - 自定义容器（:::callout 等）
 * - 引用（>）
 * - 无序列表项（- 开头）
 * - 有序列表项（数字. 开头）
 * - 分割线（--- 或 ---{...}）
 * - 图片（![alt]）
 * - HTML 标签
 * - 表格行（|...|）
 *
 * @param rawLine 原始行内容（未 trim，用于检查缩进语法如缩进列表）
 * @returns 如果该行是块级语法标记则返回 true，表示段落应当在此结束
 */
export function isMarkdownLikeParagraphBoundary(rawLine: string) {
  const line = rawLine.trim();

  return (
    !line ||                          // 空行
    /^#{1,4}\s+/.test(line) ||        // 1-4 级标题
    line.startsWith('```') ||         // 代码块开始/结束
    line.startsWith(':::') ||         // 自定义容器 / callout等
    line.startsWith('>') ||           // 引用
    /^\s*-\s+/.test(rawLine) ||       // 无序列表 / 允许前导空白用于嵌套
    /^\s*\d+\.\s+/.test(rawLine) ||   // 有序列表 / 允许前导空白
    line === '---' ||                 // 分割线
    /^---\s*\{/.test(line) ||         // 带属性的分割线
    line.startsWith('![') ||          // 图片
    /^<[^>]+>/.test(line) ||          // 原始 HTML 标签
    /^\|.*\|$/.test(line)             // 表格行
  );
}
