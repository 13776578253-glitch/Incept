import type { DbDocsLocale, DbDocsSection } from '@incept/db/docs';
import type { DocsAccessRole, DocsArticlePageModel, DocsLayoutMode } from '../shared/types';
import type { DocsImportMediaResolution } from './media';
import type { DocsCollectionBatchChange } from '@incept/db/docs';
import type { DocsCollectionDirectoryNode, DocsCollectionDraftNode } from './collection-directory';

export type DocsImportRouteType = 'singleArticle' | 'collectionArticle';

export type DocsImportKind = 'article' | 'reference' | 'note';

export type DocsImportArticleMeta = {
  documentKey?: string;
  locale: DbDocsLocale;
  routeType: DocsImportRouteType;
  kind?: DocsImportKind;
  layoutMode?: DocsLayoutMode;
  accessRole?: DocsAccessRole;
  isListed?: boolean;
  slug: string;
  title: string;
  summary: string;
  eyebrow?: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt?: string | Date;
  collectionKey?: string;
  collectionSlug?: string;
  collectionTitle?: string;
  collectionSummary?: string;
  collectionEyebrow?: string;
  position?: number;
  collectionNodeKey?: string;
  collectionParentNodeKey?: string;
};

export type DocsImportArticleBody = {
  sections: DbDocsSection[];
};

export type DocsImportArticleSource = {
  meta: DocsImportArticleMeta;
  body: DocsImportArticleBody;
};

export type DocsImportValidationIssueLevel = 'error' | 'warning';

export type DocsImportValidationIssue = {
  level: DocsImportValidationIssueLevel;
  code: string;
  message: string;
  path?: string;
};

export type DocsImportNormalizedMeta = {
  documentKey?: string;
  locale: DbDocsLocale;
  routeType: DocsImportRouteType;
  kind: DocsImportKind;
  layoutMode: DocsLayoutMode;
  accessRole: DocsAccessRole;
  isListed: boolean;
  slug: string;
  title: string;
  summary: string;
  eyebrow?: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt: string;
  collectionKey?: string;
  collectionSlug?: string;
  collectionTitle?: string;
  collectionSummary?: string;
  collectionEyebrow?: string;
  position?: number;
  collectionNodeKey?: string;
  collectionParentNodeKey?: string;
};

export type DocsImportNormalizedSource = {
  meta: DocsImportNormalizedMeta;
  body: DocsImportArticleBody;
};

export type DocsImportDraft = {
  draftType?: 'article' | 'collectionDirectory';
  id: string;
  createdAt: string;
  sourceFilePath: string;
  replace: boolean;
  source: DocsImportNormalizedSource;
  issues: DocsImportValidationIssue[];
  media: DocsImportMediaResolution;
  page: DocsArticlePageModel;
  collectionTree?: DocsCollectionDirectoryNode[];
  collectionNodes?: DocsCollectionDraftNode[];
  collectionSources?: DocsImportNormalizedSource[];
  collectionChanges?: DocsCollectionBatchChange[];
};

export type DocsImportPreviewModel = {
  draft: DocsImportDraft;
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
};
