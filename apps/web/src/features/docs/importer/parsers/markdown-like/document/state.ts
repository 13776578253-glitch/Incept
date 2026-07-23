import { addMarkdownLikeIssue } from '../errors';
import { createMarkdownLikeBlockId } from './ids';
import type { MarkdownLikeParseState, MarkdownLikeSection } from './types';

// TODO：章节解析逻辑需要更新，目前仅支持 # 标题 识别标题
// TODO: 整个 section 样式可能需要重构，应对上文不同层级标题的解析问题 / 支持多层级小标题
// TODO: 未来可能支持多篇文章的导入源对象，届时需要修改此处的 ID 生成逻辑

/**
 * 获取或创建当前正在解析的章节
 * 如果 state 中尚未设置当前章节 / 即内容出现在第一个标题之前，自动生成一个 Untitled 的兜底章节，并报content_before_section
 * @param state  解析器的当前状态，包含 section、sections、issues 等
 * @param line   当前解析内容的行号 / 用于错误定位
 * @returns      当前的 MarkdownLikeSection 对象
 */
export function ensureMarkdownLikeSection(
  state: MarkdownLikeParseState,
  line: number,
): MarkdownLikeSection {
  if (state.section) {
    return state.section;
  }

  addMarkdownLikeIssue(
    state.issues,
    line,
    'content_before_section',
    'Content blocks must appear after a # section heading.',
  );

  const section: MarkdownLikeSection = {
    id: 'untitled',
    line,
    title: 'Untitled',
    blocks: [],
  };
  state.section = section;
  state.sections.push(section);

  return section;
}

// 为当前章节中新内容块生成唯一 ID
export function makeMarkdownLikeBlockId(
  state: MarkdownLikeParseState,
  section: MarkdownLikeSection,
  type: string,
  seed?: string,
) {
  // 全局块序号自增
  // 注：此为整个文档块序号，而非每个章节独立
  state.blockIndex += 1;

  return createMarkdownLikeBlockId({
    sectionId: section.id,
    blockIndex: state.blockIndex,
    type,
    seed,
  });
}

// 为当前章节中的待办事项 / checklist item 生成唯一 ID
// history：存在 类md文档 写作过程中存在的 ID 匹配问题 / 当前必须完整无间隔书写checklist item / 存在 checklist 内大量内容的需求
// TODO: 需要修改 checklist item 的解析逻辑/注：可能修改整个适配层，而不是单纯此处自增逻辑/，支持多行内容 以及集中展示
// TODO: 目前仅支持单层级的 checklist item，未来可能支持多层级嵌套的 checklist item，届时需要修改此处的 ID 生成逻辑
export function makeMarkdownLikeChecklistItemId(
  state: MarkdownLikeParseState,
  section: MarkdownLikeSection,
) {
  state.checklistItemIndex += 1;

  return `${section.id}-checklist-item-${state.checklistItemIndex}`;
}
