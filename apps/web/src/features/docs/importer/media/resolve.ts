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

// 定义 支持的图像扩展名 / 最大本地图像文件大小 / HTML 嵌入限制
const supportedImageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const supportedHtmlExtensions = new Set(['.html', '.htm']);
const maxLocalImageBytes = 10 * 1024 * 1024;
const maxLocalHtmlBytes = 512 * 1024;

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

function isBareLocalImageReference(src: string) {
  return !src.includes('/') && !src.includes('\\');
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

function collectBlockLines(
  source: DocsImportArticleSource,
  targetType: 'image' | 'html',
  linesByBlockId: ReadonlyMap<string, number>,
) {
  const linesById = new Map<string, number>();
  for (const section of source.body.sections) {
    for (const block of section.blocks) {
      if (block.type === targetType) {
        const line = linesByBlockId.get(block.id);
        if (line !== undefined) {
          linesById.set(block.id, line);
        }
      }
    }
  }
  return linesById;
}

async function resolveLocalFilePath({
  src,
  sourceDirectory,
  contentRoot,
  allowedExtensions,
  maxBytes,
  line,
  codes,
}: {
  src: string;
  sourceDirectory: string;
  contentRoot: string;
  allowedExtensions: Set<string>;
  maxBytes: number;
  line: number | undefined;
  codes: {
    invalidReference: string;
    outsideRoot: string;
    unsupportedType: string;
    notFound: string;
    invalidFile: string;
    tooLarge: string;
    label: string;
  };
}): Promise<{ resolvedPath?: string; extension?: string; issue?: DocsImportValidationIssue }> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || path.isAbsolute(src)) {
    return {
      issue: mediaIssue(
        codes.invalidReference,
        `${codes.label} src must be a relative path inside DOCS_CONTENT_ROOT.`,
        line,
      ),
    };
  }

  const candidatePaths = [path.resolve(sourceDirectory, src)];
  if (isBareLocalImageReference(src)) {
    candidatePaths.push(path.resolve(sourceDirectory, 'assets', src));
  }

  if (candidatePaths.some((candidatePath) => !isPathInside(contentRoot, candidatePath))) {
    return {
      issue: mediaIssue(
        codes.outsideRoot,
        `${codes.label} src resolves outside DOCS_CONTENT_ROOT.`,
        line,
      ),
    };
  }

  const extension = path.extname(src).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    return {
      issue: mediaIssue(
        codes.unsupportedType,
        `Local ${codes.label.toLowerCase()} files must use one of: ${[...allowedExtensions].join(', ')}.`,
        line,
      ),
    };
  }

  let resolvedPath: string | undefined;
  for (const candidatePath of candidatePaths) {
    try {
      resolvedPath = await fs.realpath(candidatePath);
      break;
    } catch {
      // Try the convention-based assets fallback for a bare file name.
    }
  }

  if (!resolvedPath) {
    return {
      issue: mediaIssue(codes.notFound, `Local ${codes.label.toLowerCase()} file was not found: ${src}`, line),
    };
  }

  if (!isPathInside(contentRoot, resolvedPath)) {
    return {
      issue: mediaIssue(
        codes.outsideRoot,
        `${codes.label} src resolves outside DOCS_CONTENT_ROOT.`,
        line,
      ),
    };
  }

  const stats = await fs.stat(resolvedPath);
  if (!stats.isFile()) {
    return {
      issue: mediaIssue(codes.invalidFile, `${codes.label} src must reference a file.`, line),
    };
  }
  if (stats.size > maxBytes) {
    const limitLabel = maxBytes >= 1024 * 1024 ? `${maxBytes / 1024 / 1024} MB` : `${maxBytes / 1024} KB`;
    return {
      issue: mediaIssue(
        codes.tooLarge,
        `Local ${codes.label.toLowerCase()} files must not exceed ${limitLabel}.`,
        line,
      ),
    };
  }

  return { resolvedPath, extension };
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

  const resolved = await resolveLocalFilePath({
    src,
    sourceDirectory,
    contentRoot,
    allowedExtensions: supportedImageExtensions,
    maxBytes: maxLocalImageBytes,
    line,
    codes: {
      invalidReference: 'invalid_local_media_reference',
      outsideRoot: 'local_media_path_outside_root',
      unsupportedType: 'unsupported_local_media_type',
      notFound: 'local_media_not_found',
      invalidFile: 'invalid_local_media_file',
      tooLarge: 'local_media_too_large',
      label: 'Image',
    },
  });

  if (resolved.issue || !resolved.resolvedPath || !resolved.extension) {
    return { issue: resolved.issue };
  }

  const operation = await publishLocalDocsMedia({
    sourcePath: resolved.resolvedPath,
    extension: resolved.extension,
    mode,
  });

  return {
    src: operation.targetUrl,
    operation,
  };
}

async function resolveLocalHtml({
  src,
  sourceDirectory,
  contentRoot,
  line,
}: {
  src: string;
  sourceDirectory: string;
  contentRoot: string;
  line: number | undefined;
}): Promise<{ html?: string; issue?: DocsImportValidationIssue }> {
  if (isExternalHttpUrl(src) || isSiteAbsoluteUrl(src)) {
    return {
      issue: mediaIssue(
        'invalid_local_html_reference',
        'HTML block src must be a relative local file path inside DOCS_CONTENT_ROOT.',
        line,
      ),
    };
  }

  const resolved = await resolveLocalFilePath({
    src,
    sourceDirectory,
    contentRoot,
    allowedExtensions: supportedHtmlExtensions,
    maxBytes: maxLocalHtmlBytes,
    line,
    codes: {
      invalidReference: 'invalid_local_html_reference',
      outsideRoot: 'local_html_path_outside_root',
      unsupportedType: 'unsupported_local_html_type',
      notFound: 'local_html_not_found',
      invalidFile: 'invalid_local_html_file',
      tooLarge: 'local_html_too_large',
      label: 'HTML',
    },
  });

  if (resolved.issue || !resolved.resolvedPath) {
    return { issue: resolved.issue };
  }

  const html = (await fs.readFile(resolved.resolvedPath, 'utf8')).trim();
  if (!html) {
    return {
      issue: mediaIssue('invalid_local_html_file', 'HTML file must not be empty.', line),
    };
  }

  return { html };
}

export async function resolveDocsImportMedia({
  source,
  sourceFilePath,
  imageLinesById,
  htmlLinesById = new Map(),
  mode,
}: {
  source: DocsImportArticleSource;
  sourceFilePath: string;
  imageLinesById: ReadonlyMap<string, number>;
  htmlLinesById?: ReadonlyMap<string, number>;
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

  const imageLineMap = collectBlockLines(source, 'image', imageLinesById);
  const htmlLineMap = collectBlockLines(source, 'html', htmlLinesById);
  const issues: DocsImportValidationIssue[] = [];
  const operationsByTargetUrl = new Map<string, DocsImportMediaOperation>();
  const sourceDirectory = path.dirname(resolvedSourceFilePath);

  const sections = [];
  for (const section of source.body.sections) {
    const blocks: DocsImportArticleSource['body']['sections'][number]['blocks'] = [];
    for (const block of section.blocks) {
      if (block.type === 'html' && block.sourceFile && !block.html.trim()) {
        const result = await resolveLocalHtml({
          src: block.sourceFile,
          sourceDirectory,
          contentRoot,
          line: htmlLineMap.get(block.id),
        });

        if (result.issue) {
          issues.push(result.issue);
          blocks.push(block);
          continue;
        }

        blocks.push({
          ...block,
          html: result.html ?? block.html,
        });
        continue;
      }

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
        line: imageLineMap.get(block.id),
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
