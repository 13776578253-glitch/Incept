import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from './paths';
import type { DocsImportArticleSource } from './types';

// 加载文档导入源数据，从指定的文件路径动态导入模块，支持绝对路径和相对路径，要求模块必须导出一个符合 DocsImportArticleSource 结构的对象，作为后续数据规范化和预览展示的基础

// 待修改为标准结构
export async function loadDocsImportSource(filePath: string): Promise<DocsImportArticleSource> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(findRepoRoot(), filePath);
  const moduleUrl = `${pathToFileURL(absolutePath).href}?t=${Date.now()}`;
  const loadedModule = (await import(moduleUrl)) as {
    default?: DocsImportArticleSource;
    articleSource?: DocsImportArticleSource;
  };

  const source = loadedModule.default ?? loadedModule.articleSource;

  if (!source) {
    throw new Error(
      `The import source file "${absolutePath}" must export a default DocsImportArticleSource object.`,
    );
  }

  return source;
}
