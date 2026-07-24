import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from './paths';

import {
  MarkdownLikeParseError,
  markdownLikeSupportedExtensions,
  toImportIssue,
} from './parsers';
import { toMarkdownLikeDocsImportSource } from './parsers/markdown-like/parse';
import { parseMarkdownLikeDocument } from './parsers/markdown-like/document';
import { resolveDocsImportMedia } from './media';
import type { DocsImportMediaMode, DocsImportMediaResolution } from './media';
import { getDocsContentRoot } from './media/content-root';

import type { DocsImportArticleSource, DocsImportValidationIssue } from './types';

// 加载完成后统一返回数据结构
export type LoadedDocsImportSource = {
  source: DocsImportArticleSource;       // 解析/导入得到的文章源数据
  issues: DocsImportValidationIssue[];   // 校验时发现的问题列表
  media: DocsImportMediaResolution;      // 媒体资源解析结果，包括待处理的媒体操作列表
};

// 加载文档导入源数据，从指定的文件路径动态导入模块，支持绝对路径和相对路径，要求模块必须导出一个符合 DocsImportArticleSource 结构的对象，作为后续数据规范化和预览展示的基础

function getSourceExtension(filePath: string) {
  // 特殊处理 .docs.md 文件扩展名
  if (filePath.endsWith('.docs.md')) {
    return '.docs.md';
  }

  return path.extname(filePath);
}

// 创建一个无效的 Markdown-like 导入源对象 / 兜底
function createInvalidMarkdownSource(filePath: string): DocsImportArticleSource {
  //  用文件名去掉扩展名 作为后备 slug
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
    media: { operations: [] },
  };
}

async function loadMarkdownLikeDocsImportSource(
  absolutePath: string,
  mediaMode: DocsImportMediaMode,
): Promise<LoadedDocsImportSource> {
  const raw = await fs.readFile(absolutePath, 'utf8');

  try {
    const parsed = parseMarkdownLikeDocument(raw);
    if (parsed.issues.length > 0) {
      throw new MarkdownLikeParseError(parsed.issues);
    }

    const imageLinesById = new Map(
      parsed.document.sections.flatMap((section) =>
        section.blocks
          .filter((block) => block.type === 'image')
          .map((block) => [block.id, block.line] as const),
      ),
    );
    const source = toMarkdownLikeDocsImportSource(parsed.document);
    const mediaResult = await resolveDocsImportMedia({
      source,
      sourceFilePath: absolutePath,
      imageLinesById,
      mode: mediaMode,
    });

    return {
      source: mediaResult.source,
      issues: mediaResult.issues,
      media: mediaResult.media,
    };
  } catch (error) {
    if (error instanceof MarkdownLikeParseError) {
      return {
        source: createInvalidMarkdownSource(absolutePath),
        issues: error.issues.map(toImportIssue),
        media: { operations: [] },
      };
    }

    return {
      source: toMarkdownLikeDocsImportSource(parseMarkdownLikeDocument(raw).document),
      issues: [
        {
          level: 'error',
          code: 'markdown_like_media_configuration',
          message: error instanceof Error ? error.message : 'Unable to resolve Markdown-like media.',
        },
      ],
      media: { operations: [] },
    };
  }
}

// 主函数：根据文件扩展名选择加载方式，支持 Markdown-like 和 TypeScript 两种格式的文档导入源
export async function resolveDocsImportSourceFilePath(filePath: string) {
  const extension = getSourceExtension(filePath);

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  if (markdownLikeSupportedExtensions.has(extension)) {
    return path.resolve(await getDocsContentRoot(), filePath);
  }

  return path.resolve(findRepoRoot(), filePath);
}

export async function loadDocsImportSource(
  filePath: string,
  { mediaMode = 'validate' }: { mediaMode?: DocsImportMediaMode } = {},
): Promise<LoadedDocsImportSource> {
  const absolutePath = await resolveDocsImportSourceFilePath(filePath);
  const extension = getSourceExtension(absolutePath);

  if (markdownLikeSupportedExtensions.has(extension)) {
    return loadMarkdownLikeDocsImportSource(absolutePath, mediaMode);
  }

  // 按照 ts/tsx 文件处理
  // 要求模块必须导出一个符合 DocsImportArticleSource 结构的对象
  return loadTsDocsImportSource(absolutePath);
}
