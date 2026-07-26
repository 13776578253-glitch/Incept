import type { DbDocsSection } from '@incept/db/docs';
import type {
  DocsImportArticleSource,
  DocsImportNormalizedSource,
  DocsImportValidationIssue,
} from './types';

// 定义允许的元信息字段和正文字段，提供数据验证和规范化的功能，确保导入的文档数据符合预期的结构和要求，并收集潜在的问题以供用户参考和修正
// 待对齐
const allowedMetaKeys = new Set([
  'documentKey',
  'locale',
  'routeType',
  'kind',
  'layoutMode',
  'accessRole',
  'isListed',
  'slug',
  'title',
  'summary',
  'eyebrow',
  'seoTitle',
  'seoDescription',
  'publishedAt',
  'collectionKey',
  'collectionSlug',
  'collectionTitle',
  'collectionSummary',
  'collectionEyebrow',
  'position',
] as const);

const allowedBodyKeys = new Set(['sections'] as const);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidStableKey(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function addUnknownKeyWarnings(
  issues: DocsImportValidationIssue[],
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
  pathPrefix: string,
) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({
        level: 'warning',
        code: 'unknown_field',
        message: `Unknown field "${key}" will be ignored.`,
        path: `${pathPrefix}.${key}`,
      });
    }
  }
}

// 收集正文中重复的 section id 和 block id，确保每个 section 和 block 都有唯一的标识符，以避免在渲染和数据处理过程中出现混淆和错误
function collectDuplicateIds(
  sections: DbDocsSection[],
  issues: DocsImportValidationIssue[],
) {
  const sectionIds = new Set<string>();
  const blockIds = new Set<string>();

  sections.forEach((section, sectionIndex) => {
    if (sectionIds.has(section.id)) {
      issues.push({
        level: 'error',
        code: 'duplicate_section_id',
        message: `Duplicate section id "${section.id}" was found.`,
        path: `body.sections[${sectionIndex}].id`,
      });
    }

    sectionIds.add(section.id);

    section.blocks.forEach((block, blockIndex) => {
      if (blockIds.has(block.id)) {
        issues.push({
          level: 'error',
          code: 'duplicate_block_id',
          message: `Duplicate block id "${block.id}" was found.`,
          path: `body.sections[${sectionIndex}].blocks[${blockIndex}].id`,
        });
      }

      blockIds.add(block.id);
    });
  });
}

// 规范化 publishedAt 字段，支持字符串和 Date 类型的输入，输出 ISO 格式的日期字符串，如果输入无效则返回 null，以便在验证过程中捕获错误并提供反馈
function normalizePublishedAt(value?: string | Date) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function normalizeDocsImportSource(
  source: DocsImportArticleSource,
): {
  normalizedSource: DocsImportNormalizedSource;
  issues: DocsImportValidationIssue[];
} {
  const issues: DocsImportValidationIssue[] = [];
  const metaRecord = source.meta as Record<string, unknown>;
  const bodyRecord = source.body as Record<string, unknown>;

  addUnknownKeyWarnings(issues, metaRecord, allowedMetaKeys, 'meta');
  addUnknownKeyWarnings(issues, bodyRecord, allowedBodyKeys, 'body');

  if (!isNonEmptyString(source.meta.slug)) {
    issues.push({
      level: 'error',
      code: 'missing_slug',
      message: 'The import source must provide a non-empty slug.',
      path: 'meta.slug',
    });
  }

  if (!isNonEmptyString(source.meta.title)) {
    issues.push({
      level: 'error',
      code: 'missing_title',
      message: 'The import source must provide a non-empty title.',
      path: 'meta.title',
    });
  }

  if (!isNonEmptyString(source.meta.summary)) {
    issues.push({
      level: 'error',
      code: 'missing_summary',
      message: 'The import source must provide a non-empty summary.',
      path: 'meta.summary',
    });
  }

  if (source.meta.documentKey !== undefined) {
    if (!isNonEmptyString(source.meta.documentKey)) {
      issues.push({
        level: 'error',
        code: 'invalid_document_key',
        message: 'documentKey must be a non-empty string when provided.',
        path: 'meta.documentKey',
      });
    } else if (!isValidStableKey(source.meta.documentKey)) {
      issues.push({
        level: 'error',
        code: 'invalid_document_key',
        message: 'documentKey must use lowercase letters, numbers, and hyphen separators.',
        path: 'meta.documentKey',
      });
    }
  }

  if (source.meta.isListed !== undefined && typeof source.meta.isListed !== 'boolean') {
    issues.push({
      level: 'error',
      code: 'invalid_is_listed',
      message: 'isListed must be a boolean when provided.',
      path: 'meta.isListed',
    });
  }

  if (source.meta.collectionKey !== undefined) {
    if (!isNonEmptyString(source.meta.collectionKey)) {
      issues.push({
        level: 'error',
        code: 'invalid_collection_key',
        message: 'collectionKey must be a non-empty string when provided.',
        path: 'meta.collectionKey',
      });
    } else if (!isValidStableKey(source.meta.collectionKey)) {
      issues.push({
        level: 'error',
        code: 'invalid_collection_key',
        message: 'collectionKey must use lowercase letters, numbers, and hyphen separators.',
        path: 'meta.collectionKey',
      });
    }
  }

  if (!Array.isArray(source.body.sections) || source.body.sections.length === 0) {
    issues.push({
      level: 'error',
      code: 'empty_sections',
      message: 'The import source must contain at least one section.',
      path: 'body.sections',
    });
  }

  const publishedAt = normalizePublishedAt(source.meta.publishedAt);

  if (!publishedAt) {
    issues.push({
      level: 'error',
      code: 'invalid_published_at',
      message: 'The publishedAt value is not a valid date.',
      path: 'meta.publishedAt',
    });
  }

  if (source.meta.routeType === 'singleArticle') {
    if (source.meta.collectionKey) {
      issues.push({
        level: 'error',
        code: 'collection_key_not_allowed',
        message: 'singleArticle sources cannot provide collectionKey.',
        path: 'meta.collectionKey',
      });
    }

    if (source.meta.collectionSlug) {
      issues.push({
        level: 'error',
        code: 'collection_slug_not_allowed',
        message: 'singleArticle sources cannot provide collectionSlug.',
        path: 'meta.collectionSlug',
      });
    }

    if (typeof source.meta.position === 'number') {
      issues.push({
        level: 'error',
        code: 'position_not_allowed',
        message: 'singleArticle sources cannot provide position.',
        path: 'meta.position',
      });
    }
  }

  if (source.meta.routeType === 'collectionArticle') {
    if (source.meta.isListed === false) {
      issues.push({
        level: 'error',
        code: 'unlisted_collection_not_allowed',
        message: 'collectionArticle sources cannot set isListed to false.',
        path: 'meta.isListed',
      });
    }

    if (source.meta.kind === 'note') {
      issues.push({
        level: 'error',
        code: 'note_collection_not_allowed',
        message: 'note sources must use singleArticle in the first notes version.',
        path: 'meta.routeType',
      });
    }

    if (!isNonEmptyString(source.meta.collectionSlug)) {
      issues.push({
        level: 'error',
        code: 'missing_collection_slug',
        message: 'collectionArticle sources must provide collectionSlug.',
        path: 'meta.collectionSlug',
      });
    }

    if (typeof source.meta.position !== 'number' || !Number.isInteger(source.meta.position)) {
      issues.push({
        level: 'error',
        code: 'missing_position',
        message: 'collectionArticle sources must provide an integer position.',
        path: 'meta.position',
      });
    }

    if (!isNonEmptyString(source.meta.collectionTitle)) {
      issues.push({
        level: 'error',
        code: 'missing_collection_title',
        message: 'collectionArticle sources must provide collectionTitle in MVP import mode.',
        path: 'meta.collectionTitle',
      });
    }
  }

  const normalizedLayoutMode =
    source.meta.layoutMode ??
    (source.meta.routeType === 'collectionArticle' ? 'sidebar' : 'contentOnly');

  if (source.meta.routeType === 'collectionArticle' && normalizedLayoutMode === 'contentOnly') {
    issues.push({
      level: 'error',
      code: 'content_only_collection',
      message: 'collectionArticle sources cannot use contentOnly layout.',
      path: 'meta.layoutMode',
    });
  }

  if (source.body.sections?.length) {
    collectDuplicateIds(source.body.sections, issues);
  }

  const normalizedSource: DocsImportNormalizedSource = {
    meta: {
      documentKey: source.meta.documentKey,
      locale: source.meta.locale,
      routeType: source.meta.routeType,
      kind: source.meta.kind ?? 'article',
      layoutMode: normalizedLayoutMode,
      accessRole: source.meta.accessRole ?? 'guest',
      isListed: source.meta.isListed ?? true,
      slug: source.meta.slug,
      title: source.meta.title,
      summary: source.meta.summary,
      eyebrow: source.meta.eyebrow,
      seoTitle: source.meta.seoTitle,
      seoDescription: source.meta.seoDescription,
      publishedAt: publishedAt ?? new Date().toISOString(),
      collectionKey: source.meta.collectionKey,
      collectionSlug: source.meta.collectionSlug,
      collectionTitle: source.meta.collectionTitle,
      collectionSummary: source.meta.collectionSummary,
      collectionEyebrow: source.meta.collectionEyebrow,
      position: source.meta.position,
    },
    body: {
      sections: source.body.sections ?? [],
    },
  };

  return {
    normalizedSource,
    issues,
  };
}
