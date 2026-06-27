import crypto from 'node:crypto';
import path from 'node:path';
import { findRepoRoot } from './paths';
import { mapDocsImportSourceToPageModel } from './preview-mapper';
import { loadDocsImportSource } from './source-loader';
import { normalizeDocsImportSource } from './validation';
import type { DocsImportDraft } from './types';

// 创建一个新的文档导入草稿，包含从源文件加载、数据规范化到生成预览模型的完整流程，返回一个包含草稿信息和验证结果的对象，供后续的预览展示和最终导入使用
export async function createDocsImportDraft({
  filePath,
  replace,
}: {
  filePath: string;
  replace: boolean;
}): Promise<DocsImportDraft> {
  const resolvedFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(findRepoRoot(), filePath);
  const loadedSource = await loadDocsImportSource(filePath);
  const source = loadedSource.source;
  const { normalizedSource, issues } = normalizeDocsImportSource(source);

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceFilePath: resolvedFilePath,
    replace,
    source: normalizedSource,
    issues: [...loadedSource.issues, ...issues],
    page: mapDocsImportSourceToPageModel(normalizedSource),
  };
}
