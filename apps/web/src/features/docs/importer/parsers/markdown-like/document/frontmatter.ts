import { addMarkdownLikeIssue } from '../errors';
import {
  markdownLikeAllowedAccessRoles,
  markdownLikeAllowedFrontmatterKeys,
  markdownLikeAllowedKinds,
  markdownLikeAllowedLayoutModes,
  markdownLikeRequiredFrontmatterKeys,
} from '../syntax';
import type { MarkdownLikeFrontmatter } from './types';

export type MarkdownLikeFrontmatterParseResult = {
  frontmatter: MarkdownLikeFrontmatter;
  contentStartLine: number;
};

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * 解析 Markdown 文档的前置元数据（Frontmatter）
 * @param lines   文档的文本行数组（每行一个元素，不含换行符）
 * @param issues  用于收集解析过程中发现的问题（通过 addMarkdownLikeIssue 副作用添加）
 * @returns 解析出的 frontmatter 对象和正文开始行号
 */

export function parseMarkdownLikeFrontmatter(
  lines: string[],
  issues: Parameters<typeof addMarkdownLikeIssue>[0],
): MarkdownLikeFrontmatterParseResult {
  if (lines[0]?.trim() !== '---') {
    addMarkdownLikeIssue(
      issues,
      1,
      'missing_frontmatter',
      'Markdown-like source must start with frontmatter delimited by ---.',
    );
    return { frontmatter: {}, contentStartLine: 1 };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

  if (endIndex === -1) {
    addMarkdownLikeIssue(
      issues,
      1,
      'invalid_frontmatter',
      'Frontmatter must be closed with ---.',
    );
    return { frontmatter: {}, contentStartLine: lines.length + 1 };
  }

  const frontmatter: MarkdownLikeFrontmatter = {};

  for (let index = 1; index < endIndex; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);

    if (!match) {
      addMarkdownLikeIssue(
        issues,
        index + 1,
        'invalid_frontmatter',
        'Frontmatter fields must use key: value syntax.',
      );
      continue;
    }

    const [, key, value] = match;
    frontmatter[key] = unquote(value);
  }

  validateMarkdownLikeFrontmatter(frontmatter, issues);

  return {
    frontmatter,
    contentStartLine: endIndex + 2,
  };
}

function validateMarkdownLikeFrontmatter(
  frontmatter: MarkdownLikeFrontmatter,
  issues: Parameters<typeof addMarkdownLikeIssue>[0],
) {
  for (const key of Object.keys(frontmatter)) {
    if (!markdownLikeAllowedFrontmatterKeys.has(key)) {
      addMarkdownLikeIssue(
        issues,
        1,
        'unsupported_frontmatter_field',
        `Unsupported frontmatter field "${key}" in markdown-like v1.`,
      );
    }
  }

  for (const key of markdownLikeRequiredFrontmatterKeys) {
    if (!frontmatter[key]?.trim()) {
      addMarkdownLikeIssue(
        issues,
        1,
        'missing_frontmatter_field',
        `Frontmatter must provide a non-empty ${key}.`,
      );
    }
  }

  const routeType = frontmatter.routeType ?? 'singleArticle';

  if (routeType !== 'singleArticle' && routeType !== 'collectionArticle') {
    addMarkdownLikeIssue(
      issues,
      1,
      'unsupported_route_type',
      'Markdown-like docs sources must use routeType: singleArticle or collectionArticle.',
    );
  }

  if (frontmatter.kind && !markdownLikeAllowedKinds.has(frontmatter.kind)) {
    addMarkdownLikeIssue(
      issues,
      1,
      'invalid_frontmatter',
      `Unsupported kind "${frontmatter.kind}".`,
    );
  }

  if (frontmatter.layoutMode && !markdownLikeAllowedLayoutModes.has(frontmatter.layoutMode)) {
    addMarkdownLikeIssue(
      issues,
      1,
      'invalid_frontmatter',
      'Markdown-like docs sources must use a supported layoutMode.',
    );
  }

  if (frontmatter.accessRole && !markdownLikeAllowedAccessRoles.has(frontmatter.accessRole)) {
    addMarkdownLikeIssue(
      issues,
      1,
      'invalid_frontmatter',
      `Unsupported accessRole "${frontmatter.accessRole}".`,
    );
  }

  if (frontmatter.isListed && frontmatter.isListed !== 'true' && frontmatter.isListed !== 'false') {
    addMarkdownLikeIssue(
      issues,
      1,
      'invalid_frontmatter',
      'isListed must be true or false.',
    );
  }

  if (routeType === 'collectionArticle') {
    if (frontmatter.isListed === 'false') {
      addMarkdownLikeIssue(
        issues,
        1,
        'invalid_frontmatter',
        'collectionArticle sources cannot set isListed to false.',
      );
    }

    for (const key of ['collectionKey', 'collectionSlug', 'collectionTitle', 'position'] as const) {
      if (!frontmatter[key]?.trim()) {
        addMarkdownLikeIssue(
          issues,
          1,
          'missing_frontmatter_field',
          `collectionArticle sources must provide a non-empty ${key}.`,
        );
      }
    }

    if (
      frontmatter.collectionKey &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.collectionKey)
    ) {
      addMarkdownLikeIssue(
        issues,
        1,
        'invalid_frontmatter',
        'collectionKey must use lowercase letters, numbers, and hyphen separators.',
      );
    }

    if (frontmatter.position && !/^\d+$/.test(frontmatter.position)) {
      addMarkdownLikeIssue(
        issues,
        1,
        'invalid_frontmatter',
        'collectionArticle position must be an integer.',
      );
    }

    if (frontmatter.layoutMode && frontmatter.layoutMode !== 'sidebar') {
      addMarkdownLikeIssue(
        issues,
        1,
        'invalid_frontmatter',
        'collectionArticle sources must use layoutMode: sidebar.',
      );
    }

    if (frontmatter.kind === 'note') {
      addMarkdownLikeIssue(
        issues,
        1,
        'invalid_frontmatter',
        'collectionArticle sources cannot use kind: note.',
      );
    }
  }

  if (routeType === 'singleArticle') {
    for (const key of [
      'collectionKey',
      'collectionSlug',
      'collectionTitle',
      'collectionSummary',
      'collectionEyebrow',
      'position',
    ] as const) {
      if (frontmatter[key] !== undefined) {
        addMarkdownLikeIssue(
          issues,
          1,
          'invalid_frontmatter',
          `singleArticle sources cannot provide ${key}.`,
        );
      }
    }
  }
}
