import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from './paths';
import {
  MarkdownLikeParseError,
  markdownLikeSupportedExtensions,
  parseMarkdownLikeDocsSource,
  toImportIssue,
} from './parsers';
import type { DocsImportArticleSource, DocsImportValidationIssue } from './types';

export type LoadedDocsImportSource = {
  source: DocsImportArticleSource;
  issues: DocsImportValidationIssue[];
};

// 加载文档导入源数据，从指定的文件路径动态导入模块，支持绝对路径和相对路径，要求模块必须导出一个符合 DocsImportArticleSource 结构的对象，作为后续数据规范化和预览展示的基础

// 待修改为标准结构
function getSourceExtension(filePath: string) {
  if (filePath.endsWith('.docs.md')) {
    return '.docs.md';
  }

  return path.extname(filePath);
}

function createInvalidMarkdownSource(filePath: string): DocsImportArticleSource {
  const fallbackSlug = path.basename(filePath).replace(/\.[^.]+$/, '') || 'invalid-markdown-source';

  return {
    meta: {
      locale: 'en',
      routeType: 'singleArticle',
      kind: 'article',
      layoutMode: 'contentOnly',
      accessRole: 'guest',
      slug: fallbackSlug,
      title: 'Invalid markdown-like import source',
      summary: 'This source could not be parsed. Review parser issues before importing.',
    },
    body: {
      sections: [],
    },
  };
}

async function loadTsDocsImportSource(absolutePath: string): Promise<LoadedDocsImportSource> {
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

  return {
    source,
    issues: [],
  };
}

async function loadMarkdownLikeDocsImportSource(
  absolutePath: string,
): Promise<LoadedDocsImportSource> {
  const raw = await fs.readFile(absolutePath, 'utf8');

  try {
    return {
      source: parseMarkdownLikeDocsSource(raw),
      issues: [],
    };
  } catch (error) {
    if (error instanceof MarkdownLikeParseError) {
      return {
        source: createInvalidMarkdownSource(absolutePath),
        issues: error.issues.map(toImportIssue),
      };
    }

    throw error;
  }
}

export async function loadDocsImportSource(filePath: string): Promise<LoadedDocsImportSource> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(findRepoRoot(), filePath);

  const extension = getSourceExtension(absolutePath);

  if (markdownLikeSupportedExtensions.has(extension)) {
    return loadMarkdownLikeDocsImportSource(absolutePath);
  }

  return loadTsDocsImportSource(absolutePath);
}
