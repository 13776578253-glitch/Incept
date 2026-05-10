import type { DbDocsBody, DbDocsNavGroup, DbDocsSidebar } from '../types';

/**
 * 校验 bodyJson 是否为合法的文档正文对象。
 * 当前数据库约定结构为 { sections: [...] }。
 * 如果顶层或 sections 结构不对则直接抛错，防止脏数据传入上层。
 */
export function assertDocsBody(value: unknown): DbDocsBody {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { sections?: unknown }).sections)
  ) {
    throw new Error(
      'Invalid docs bodyJson: expected an object with a sections array.',
    );
  }

  return value as DbDocsBody;
}

/**
 * 校验 sidebarJson 是否包含合法的导航分组数组。
 * 允许 sidebarJson 为 null 或 undefined，表示没有侧边栏。
 */
export function assertDocsSidebar(value: unknown): DbDocsSidebar {
  if (value == null) {
    return { groups: [] };
  }

  if (!Array.isArray((value as { groups?: unknown }).groups)) {
    throw new Error('Invalid docs sidebarJson: expected a groups array.');
  }

  return {
    groups: (value as { groups: DbDocsNavGroup[] }).groups,
  };
}

/**
  * 比较函数，用于按照 publishedAt 字段降序排序文档记录。
 */
export function comparePublishedAtDesc(
  a: { publishedAt?: Date | null },
  b: { publishedAt?: Date | null },
) {
  const aTime = a.publishedAt?.getTime() ?? 0;
  const bTime = b.publishedAt?.getTime() ?? 0;
  return bTime - aTime;
}
