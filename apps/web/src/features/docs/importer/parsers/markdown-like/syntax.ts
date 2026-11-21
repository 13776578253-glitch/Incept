import {
  docsCalloutTones,
  docsCalloutVariants,
  docsCodeVariants,
  docsDividerVariants,
  docsParagraphSpacings,
  docsParagraphVariants,
} from '../../../block-system/presets';

// 支持字段
export const markdownLikeSupportedExtensions = new Set(['.md', '.docs.md']);

export const markdownLikeAllowedFrontmatterKeys = new Set([
  'documentKey',
  'locale',
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
  'kind',
  'layoutMode',
  'accessRole',
  'isListed',
  'routeType',
]);

export const markdownLikeRequiredFrontmatterKeys = [
  'locale',
  'slug',
  'title',
  'summary',
] as const;

export const markdownLikeAllowedKinds = new Set([
  'article', 
  'reference', 
  'note'
]);

export const markdownLikeAllowedLayoutModes = new Set(['contentOnly', 'sidebar']);

export const markdownLikeAllowedAccessRoles = new Set([
  'guest', 
  'pro',
  'private',
]);

export const markdownLikeAllowedCalloutTones = new Set<string>(docsCalloutTones);

export const markdownLikeAllowedCalloutVariants = new Set<string>(docsCalloutVariants);

export const markdownLikeAllowedCodeVariants = new Set<string>(docsCodeVariants);

export const markdownLikeAllowedDividerVariants = new Set<string>(docsDividerVariants);

export const markdownLikeAllowedParagraphVariants = new Set<string>(docsParagraphVariants);

export const markdownLikeAllowedParagraphSpacings = new Set<string>(docsParagraphSpacings);
