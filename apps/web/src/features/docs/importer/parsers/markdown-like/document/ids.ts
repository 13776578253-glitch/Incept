// 生成 section 与 block 的稳定 ID，支持中文等 Unicode 标题
// ID 生成逻辑待进一步明确
// TODO: 未来可能支持多篇文章的导入源对象，届时需要修改此处的 ID 生成逻辑

export function slugifyMarkdownLikeId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[`'"()[\]{}]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/**
 * 生成一个文档块的唯一 ID
 * @param sectionId  所属章节的 ID
 * @param blockIndex 该块在章节内的序号 / 从 0 开始
 * @param type       块类型 / 如 paragraph/code"等
 * @param seed       可选的种子文本，用于生成可读后缀 / 例如标题文本
 * @returns          格式为 sectionId-type-blockIndex / sectionId-type-blockIndex-可读后缀 的 ID
 */
export function createMarkdownLikeBlockId({
  sectionId,
  blockIndex,
  type,
  seed,
}: {
  sectionId: string;
  blockIndex: number;
  type: string;
  seed?: string;
}) {
  const readableSuffix = seed ? slugifyMarkdownLikeId(seed).slice(0, 36) : '';
  const stablePrefix = `${sectionId}-${type}-${blockIndex}`;

  return readableSuffix ? `${stablePrefix}-${readableSuffix}` : stablePrefix;
}
