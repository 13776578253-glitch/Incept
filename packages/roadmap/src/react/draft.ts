// 新建草稿：看板在内存里造一条尚未落库的条目，复用同一套弹窗。
// 前缀是唯一的身份标记 —— 弹窗据此进入创建模式，保存后看板负责把草稿换成服务端返回值。
export const ROADMAP_DRAFT_KEY_PREFIX = 'draft:';

export function isDraftEntryKey(key: string): boolean {
  return key.startsWith(ROADMAP_DRAFT_KEY_PREFIX);
}

export function createDraftEntryKey(now: number): string {
  return `${ROADMAP_DRAFT_KEY_PREFIX}${now}`;
}
