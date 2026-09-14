import fs from 'node:fs/promises';
import path from 'node:path';
import { getDocsContentRoot } from './media/content-root';
import { loadDocsImportSource } from './source-loader';
import { normalizeDocsImportSource } from './validation';
import type { DocsImportMediaOperation } from './media';
import type { DocsImportMediaMode } from './media';
import type {
  DocsImportNormalizedSource,
  DocsImportValidationIssue,
} from './types';

const numberedEntryPattern = /^(\d+)-(.+)$/;
const maxCollectionFolderDepth = 3;

export type DocsCollectionDirectoryNode = {
  name: string;
  nodeKey: string;
  parentNodeKey?: string;
  sortOrder: number;
  type: 'folder' | 'article';
  relativePath: string;
  sourceFilePath?: string;
  source?: DocsImportNormalizedSource;
  children: DocsCollectionDirectoryNode[];
};

export type DocsCollectionDirectoryImport = {
  directoryPath: string;
  sources: Array<{
    sourceFilePath: string;
    source: DocsImportNormalizedSource;
  }>;
  tree: DocsCollectionDirectoryNode[];
  issues: DocsImportValidationIssue[];
  mediaOperations: DocsImportMediaOperation[];
};

type CollectionBatchMeta = {
  collectionKey?: string;
  locale?: 'en' | 'zh';
  collectionSlug?: string;
  collectionTitle?: string;
  accessRole?: string;
};

export type DocsCollectionDraftNode = {
  nodeKey: string;
  type: 'folder' | 'article';
  parentNodeKey?: string;
  position: number;
  label: string;
  locale: 'en' | 'zh';
};

export function flattenDocsCollectionDirectoryTree(
  nodes: DocsCollectionDirectoryNode[],
  locale: 'en' | 'zh',
  result: DocsCollectionDraftNode[] = [],
) {
  for (const node of nodes) {
    result.push({
      nodeKey: node.nodeKey,
      type: node.type,
      parentNodeKey: node.parentNodeKey,
      position: node.sortOrder,
      label: node.name,
      locale,
    });
    flattenDocsCollectionDirectoryTree(node.children, locale, result);
  }

  return result;
}

function parseNumberedEntry(name: string) {
  const match = name.match(numberedEntryPattern);

  if (!match) {
    return null;
  }

  return {
    sortOrder: Number(match[1]),
    name: match[2],
  };
}

function addIssue(
  issues: DocsImportValidationIssue[],
  message: string,
  pathValue: string,
) {
  issues.push({
    level: 'error',
    code: 'collection_directory_structure',
    message,
    path: pathValue,
  });
}

function validateSiblingOrders(
  entries: Array<{ name: string; sortOrder: number }>,
  relativePath: string,
  issues: DocsImportValidationIssue[],
) {
  const seen = new Map<number, string>();

  for (const entry of entries) {
    const previous = seen.get(entry.sortOrder);

    if (previous) {
      addIssue(
        issues,
        `Duplicate collection order ${entry.sortOrder} in "${relativePath}" (${previous} and ${entry.name}).`,
        relativePath,
      );
    }

    seen.set(entry.sortOrder, entry.name);
  }

  const orders = [...seen.keys()].sort((left, right) => left - right);
  orders.forEach((order, index) => {
    const expectedOrder = index + 1;
    if (order !== expectedOrder) {
      addIssue(
        issues,
        `Collection entries in "${relativePath}" must use consecutive numeric prefixes starting at 01.`,
        relativePath,
      );
      return;
    }
  });
}

function sortNodes(nodes: DocsCollectionDirectoryNode[]) {
  nodes.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  nodes.forEach((node) => sortNodes(node.children));
}

async function scanDirectory(
  directoryPath: string,
  relativeDirectoryPath: string,
  folderDepth: number,
  issues: DocsImportValidationIssue[],
  sources: DocsCollectionDirectoryImport['sources'],
  mediaOperations: DocsImportMediaOperation[],
  mediaMode: DocsImportMediaMode,
  parentNodeKey?: string,
): Promise<DocsCollectionDirectoryNode[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const numberedEntries = entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ entry, parsed: parseNumberedEntry(entry.name) }))
    .filter((item): item is { entry: typeof entries[number]; parsed: NonNullable<ReturnType<typeof parseNumberedEntry>> } => Boolean(item.parsed));

  for (const entry of entries) {
    if (!entry.name.startsWith('.') && entry.isFile() && entry.name.endsWith('.docs.md') && !parseNumberedEntry(entry.name)) {
      addIssue(
        issues,
        'Collection article files must use a numeric prefix such as 01-article.docs.md.',
        path.join(relativeDirectoryPath, entry.name),
      );
    }
  }

  validateSiblingOrders(
    numberedEntries.map(({ entry, parsed }) => ({ name: entry.name, sortOrder: parsed.sortOrder })),
    relativeDirectoryPath || '.',
    issues,
  );

  const nodes: DocsCollectionDirectoryNode[] = [];

  for (const { entry, parsed } of numberedEntries) {
    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = path.join(relativeDirectoryPath, entry.name);

    if (entry.isDirectory()) {
      if (folderDepth >= maxCollectionFolderDepth) {
        addIssue(
          issues,
          `Collection folders cannot be nested deeper than ${maxCollectionFolderDepth} levels.`,
          relativePath,
        );
        // TODO: The depth limit only reports an issue; the scan still recurses and builds deeper nodes, so confirm whether a directory import should stop at the limit.
      }

      const nodeKey = parentNodeKey
        ? `${parentNodeKey}/${String(parsed.sortOrder).padStart(2, '0')}`
        : `folder-root-${String(parsed.sortOrder).padStart(2, '0')}`;
      nodes.push({
        name: parsed.name,
        nodeKey,
        parentNodeKey,
        sortOrder: parsed.sortOrder,
        type: 'folder',
        relativePath,
        children: await scanDirectory(
          absolutePath,
          relativePath,
          folderDepth + 1,
          issues,
          sources,
          mediaOperations,
          mediaMode,
          nodeKey,
        ),
      });
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.docs.md')) {
      addIssue(
        issues,
        'Collection directory entries must be numbered folders or numbered .docs.md files.',
        relativePath,
      );
      continue;
    }

    const loaded = await loadDocsImportSource(absolutePath, { mediaMode });
    const normalized = normalizeDocsImportSource(loaded.source);
    issues.push(...loaded.issues, ...normalized.issues);
    mediaOperations.push(...loaded.media.operations);

    if (normalized.normalizedSource.meta.routeType !== 'collectionArticle') {
      addIssue(
        issues,
        'Every article in a collection directory must use routeType: collectionArticle.',
        relativePath,
      );
    }

    const source = normalized.normalizedSource;
    const nodeKey = source.meta.documentKey
      ? `article-${source.meta.documentKey}`
      : `article-${relativePath.replace(/\\/g, '/')}`;
    const sourceWithNavigation = {
      ...source,
      meta: {
        ...source.meta,
        collectionNodeKey: nodeKey,
        collectionParentNodeKey: parentNodeKey,
        // The physical directory order is authoritative for a directory batch.
        position: parsed.sortOrder,
      },
    };
    sources.push({ sourceFilePath: absolutePath, source: sourceWithNavigation });
    nodes.push({
      name: parsed.name,
      nodeKey,
      parentNodeKey,
      sortOrder: parsed.sortOrder,
      type: 'article',
      relativePath,
      sourceFilePath: absolutePath,
      source: sourceWithNavigation,
      children: [],
    });
  }

  sortNodes(nodes);
  return nodes;
}

export async function scanDocsCollectionDirectory(
  directoryPath: string,
  { mediaMode = 'validate' }: { mediaMode?: DocsImportMediaMode } = {},
) {
  const contentRoot = await getDocsContentRoot();
  const absoluteDirectoryPath = path.isAbsolute(directoryPath)
    ? path.resolve(directoryPath)
    : path.resolve(contentRoot, directoryPath);
  const relativeDirectoryPath = path.relative(contentRoot, absoluteDirectoryPath);
  const issues: DocsImportValidationIssue[] = [];

  if (
    relativeDirectoryPath.startsWith('..') ||
    path.isAbsolute(relativeDirectoryPath)
  ) {
    addIssue(issues, 'Collection directory must be inside DOCS_CONTENT_ROOT.', directoryPath);
    return {
      directoryPath: absoluteDirectoryPath,
      sources: [],
      tree: [],
      issues,
      mediaOperations: [],
    } satisfies DocsCollectionDirectoryImport;
  }

  const sources: DocsCollectionDirectoryImport['sources'] = [];
  const mediaOperations: DocsImportMediaOperation[] = [];
  const tree = await scanDirectory(
    absoluteDirectoryPath,
    '',
    0,
    issues,
    sources,
    mediaOperations,
    mediaMode,
  );

  const collectionKeys = new Set(
    sources
      .map(({ source }) => source.meta.collectionKey)
      .filter((value): value is string => Boolean(value)),
  );

  if (collectionKeys.size > 1) {
    addIssue(issues, 'All collection articles must use the same collectionKey.', 'meta.collectionKey');
  }

  const batchMeta = sources.reduce<CollectionBatchMeta>((result, { source }) => {
    const meta = source.meta;

    if (!result.collectionKey) {
      result.collectionKey = meta.collectionKey;
    } else if (result.collectionKey !== meta.collectionKey) {
      addIssue(issues, 'All collection articles must use the same collectionKey.', 'meta.collectionKey');
    }

    if (!result.locale) {
      result.locale = meta.locale;
    } else if (result.locale !== meta.locale) {
      addIssue(issues, 'A collection directory batch must contain one locale only.', 'meta.locale');
    }

    for (const key of ['collectionSlug', 'collectionTitle', 'accessRole'] as const) {
      const value = meta[key];
      if (result[key] === undefined) {
        result[key] = value;
      } else if (result[key] !== value) {
        addIssue(
          issues,
          `All collection articles in one batch must use the same ${key}.`,
          `meta.${key}`,
        );
      }
    }

    if (!meta.collectionKey) {
      addIssue(
        issues,
        'Every article in a collection directory must provide collectionKey.',
        'meta.collectionKey',
      );
    }

    return result;
  }, {});

  return {
    directoryPath: absoluteDirectoryPath,
    sources,
    tree,
    issues,
    mediaOperations,
  } satisfies DocsCollectionDirectoryImport;
}
