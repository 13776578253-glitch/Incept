import fs from 'node:fs/promises';
import path from 'node:path';

import type { DocsImportArticleSource, DocsImportValidationIssue } from '../types';
import { getDocsContentRoot } from './content-root';
import { publishLocalDocsMedia } from './local-store';
import type {
  DocsImportMediaMode,
  DocsImportMediaOperation,
  DocsImportMediaResolution,
} from './types';

// 定义 支持的图像扩展名 / 最大本地图像文件大小
const supportedImageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const maxLocalImageBytes = 10 * 1024 * 1024;

function isPathInside(parentPath: string, candidatePath: string) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isExternalHttpUrl(src: string) {
  return /^https?:\/\//i.test(src);
}

function isSiteAbsoluteUrl(src: string) {
  return src.startsWith('/');
}

function mediaIssue(
  code: string,
  message: string,
  line: number | undefined,
): DocsImportValidationIssue {
  return {
    level: 'error',
    code,
    message,
    path: line === undefined ? undefined : `source.line:${line}`,
  };
}

function collectImageLines(source: DocsImportArticleSource, imageLinesById: ReadonlyMap<string, number>) {
  const linesById = new Map<string, number>();
  for (const section of source.body.sections) {
    for (const block of section.blocks) {
      if (block.type === 'image') {
        const line = imageLinesById.get(block.id);
        if (line !== undefined) {
          linesById.set(block.id, line);
        }
      }
    }
  }
  return linesById;
}

async function resolveLocalImage({
  src,
  sourceDirectory,
  contentRoot,
  mode,
  line,
}: {
  src: string;
  sourceDirectory: string;
  contentRoot: string;
  mode: DocsImportMediaMode;
  line: number | undefined;
}): Promise<{ src?: string; operation?: DocsImportMediaOperation; issue?: DocsImportValidationIssue }> {
  if (isExternalHttpUrl(src) || isSiteAbsoluteUrl(src)) {
    return { src };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || path.isAbsolute(src)) {
    return {
      issue: mediaIssue(
        'invalid_local_media_reference',
        'Image src must be a relative path inside DOCS_CONTENT_ROOT, a site-relative path, or an http(s) URL.',
        line,
      ),
    };
  }

  const candidatePath = path.resolve(sourceDirectory, src);
  if (!isPathInside(contentRoot, candidatePath)) {
    return {
      issue: mediaIssue(
        'local_media_path_outside_root',
        'Image src resolves outside DOCS_CONTENT_ROOT.',
        line,
      ),
    };
  }

  const extension = path.extname(candidatePath).toLowerCase();
  if (!supportedImageExtensions.has(extension)) {
    return {
      issue: mediaIssue(
        'unsupported_local_media_type',
        `Local image files must use one of: ${[...supportedImageExtensions].join(', ')}.`,
        line,
      ),
    };
  }

  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(candidatePath);
    if (!isPathInside(contentRoot, resolvedPath)) {
      return {
        issue: mediaIssue(
          'local_media_path_outside_root',
          'Image src resolves outside DOCS_CONTENT_ROOT.',
          line,
        ),
      };
    }

    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return {
        issue: mediaIssue('invalid_local_media_file', 'Image src must reference a file.', line),
      };
    }
    if (stats.size > maxLocalImageBytes) {
      return {
        issue: mediaIssue(
          'local_media_too_large',
          `Local image files must not exceed ${maxLocalImageBytes / 1024 / 1024} MB.`,
          line,
        ),
      };
    }
  } catch {
    return {
      issue: mediaIssue('local_media_not_found', `Local image file was not found: ${src}`, line),
    };
  }

  const operation = await publishLocalDocsMedia({
    sourcePath: resolvedPath,
    extension,
    mode,
  });

  return {
    src: operation.targetUrl,
    operation,
  };
}

export async function resolveDocsImportMedia({
  source,
  sourceFilePath,
  imageLinesById,
  mode,
}: {
  source: DocsImportArticleSource;
  sourceFilePath: string;
  imageLinesById: ReadonlyMap<string, number>;
  mode: DocsImportMediaMode;
}): Promise<{
  source: DocsImportArticleSource;
  issues: DocsImportValidationIssue[];
  media: DocsImportMediaResolution;
}> {
  const contentRoot = await getDocsContentRoot();
  const resolvedSourceFilePath = await fs.realpath(sourceFilePath);

  if (!isPathInside(contentRoot, resolvedSourceFilePath)) {
    throw new Error(
      `Markdown-like source files must be inside DOCS_CONTENT_ROOT: ${resolvedSourceFilePath}`,
    );
  }

  const linesById = collectImageLines(source, imageLinesById);
  const issues: DocsImportValidationIssue[] = [];
  const operationsByTargetUrl = new Map<string, DocsImportMediaOperation>();
  const sourceDirectory = path.dirname(resolvedSourceFilePath);

  const sections = [];
  for (const section of source.body.sections) {
    const blocks: DocsImportArticleSource['body']['sections'][number]['blocks'] = [];
    for (const block of section.blocks) {
      if (block.type !== 'image') {
        blocks.push(block);
        continue;
      }

      // Validate every reference before publishing any generated media files.
      const result = await resolveLocalImage({
        src: block.src,
        sourceDirectory,
        contentRoot,
        mode: 'validate',
        line: linesById.get(block.id),
      });

      if (result.issue) {
        issues.push(result.issue);
        blocks.push(block);
        continue;
      }

      if (result.operation) {
        operationsByTargetUrl.set(result.operation.targetUrl, result.operation);
      }

      blocks.push({
        ...block,
        src: result.src ?? block.src,
      });
    }
    sections.push({ ...section, blocks });
  }

  let operations = [...operationsByTargetUrl.values()];
  if (issues.length === 0 && mode === 'publish') {
    operations = await Promise.all(
      operations.map((operation) =>
        publishLocalDocsMedia({
          sourcePath: operation.sourcePath,
          extension: path.extname(operation.sourcePath),
          mode: 'publish',
        }),
      ),
    );
  }

  return {
    source: {
      ...source,
      body: { sections },
    },
    issues,
    media: { operations },
  };
}
