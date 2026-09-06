import crypto from 'node:crypto';
import { previewDocsCollectionDirectory } from '@incept/db/docs';
import { mapDocsImportSourceToPageModel } from './preview-mapper';
import { loadDocsImportSource, resolveDocsImportSourceFilePath } from './source-loader';
import {
  flattenDocsCollectionDirectoryTree,
  scanDocsCollectionDirectory,
} from './collection-directory';
import { normalizeDocsImportSource } from './validation';
import type { DocsImportMediaMode } from './media';
import type { DocsImportDraft } from './types';

// 创建一个新的文档导入草稿，包含从源文件加载、数据规范化到生成预览模型的完整流程，返回一个包含草稿信息和验证结果的对象，供后续的预览展示和最终导入使用
export async function createDocsImportDraft({
  filePath,
  replace,
  mediaMode = 'validate', //  'validate' / 'publish' 在创建草稿时仅进行验证，而不进行实际发布
}: {
  filePath: string;
  replace: boolean;
  mediaMode?: DocsImportMediaMode;
}): Promise<DocsImportDraft> {
  const resolvedFilePath = await resolveDocsImportSourceFilePath(filePath);
  const loadedSource = await loadDocsImportSource(filePath, { mediaMode });
  const source = loadedSource.source;
  const { normalizedSource, issues } = normalizeDocsImportSource(source);

  return {
    draftType: 'article',
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceFilePath: resolvedFilePath,
    replace,
    source: normalizedSource,
    issues: [...loadedSource.issues, ...issues],
    media: loadedSource.media,
    page: mapDocsImportSourceToPageModel(normalizedSource),
  };
}

export async function createDocsCollectionDirectoryDraft({
  directoryPath,
  replace,
  mediaMode = 'validate',
}: {
  directoryPath: string;
  replace: boolean;
  mediaMode?: DocsImportMediaMode;
}): Promise<DocsImportDraft> {
  const collection = await scanDocsCollectionDirectory(directoryPath, { mediaMode });
  const firstSource = collection.sources[0]?.source;

  if (!firstSource) {
    throw new Error('Collection directory must contain at least one numbered .docs.md article.');
  }

  const page = mapDocsImportSourceToPageModel(firstSource);
  const collectionNodes = flattenDocsCollectionDirectoryTree(
    collection.tree,
    firstSource.meta.locale,
  );
  const collectionChanges = collection.issues.some((issue) => issue.level === 'error')
    ? []
    : await previewDocsCollectionDirectory({
        sources: collection.sources.map(({ source }) => source),
        nodes: collectionNodes,
        replace,
      });

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    draftType: 'collectionDirectory',
    sourceFilePath: collection.directoryPath,
    replace,
    source: firstSource,
    collectionSources: collection.sources.map(({ source }) => source),
    collectionTree: collection.tree,
    collectionNodes,
    collectionChanges,
    issues: collection.issues,
    media: { operations: collection.mediaOperations },
    page,
  };
}
