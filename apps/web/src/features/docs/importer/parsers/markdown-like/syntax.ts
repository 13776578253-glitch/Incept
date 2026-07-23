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

export const markdownLikeAllowedCalloutTones = new Set([
  'note',
  'tip',
  'attention',
  'warning',
  'meta',
]);

export const markdownLikeAllowedCalloutVariants = new Set([
  'default',
  'soft',
  'context',
]);

export const markdownLikeAllowedCodeVariants = new Set(['block', 'compact']);

export const markdownLikeAllowedDividerVariants = new Set(['default', 'spacious']);

export const markdownLikeAllowedParagraphVariants = new Set(['default', 'lead', 'muted']);

export const markdownLikeAllowedParagraphSpacings = new Set(['default', 'relaxed']);
