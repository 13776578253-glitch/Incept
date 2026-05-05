import type {
  MockDocsArchiveGroup,
  MockDocsArticle,
} from '@/lib/mock/shared/mock-types';
import { docsLegacyReferenceSlug } from '@/lib/mock/pages/docs/article/docs-article-pages.mock';

const docs2026Articles: MockDocsArticle[] = [
  {
    id: 'docs-2026-document-shells',
    slug: docsLegacyReferenceSlug,
    title: 'Building a reusable document shell for the docs surface',
    summary:
      'A test article for validating fixed navigation, a reading column, and an outline rail before the reference pattern becomes the default docs interface.',
    publishedAt: '2026-04-28',
    requiredRole: 'guest',
    eyebrow: 'Reference',
    tags: ['structure', 'shell'],
  },
  {
    id: 'docs-2026-right-rail-rhythm',
    slug: 'right-rail-rhythm-study',
    title: 'Balancing right-rail metadata without breaking reading flow',
    summary:
      'Experiments around metadata density, summary length, and how much scaffolding a calm archive page can carry before it feels procedural.',
    publishedAt: '2026-04-16',
    requiredRole: 'member',
    eyebrow: 'Interface study',
    tags: ['layout', 'reading'],
  },
  {
    id: 'docs-2026-gated-drafts',
    slug: 'gated-drafts-and-release-boundaries',
    title: 'Gated drafts and release boundaries',
    summary:
      'A working document for deciding when drafts become visible in the archive and which editorial signals indicate restricted access.',
    publishedAt: '2026-04-05',
    requiredRole: 'pro',
    eyebrow: 'Internal draft',
    tags: ['permissions', 'workflow'],
  },
];

const docs2025Articles: MockDocsArticle[] = [
  {
    id: 'docs-2025-navigation-review',
    slug: 'navigation-review-as-product-surface',
    title: 'Navigation review as a product surface',
    summary:
      'Archive notes from the pass where navigation stopped being scaffolding and started behaving like a durable product surface.',
    publishedAt: '2025-12-19',
    requiredRole: 'guest',
    eyebrow: 'Archive note',
    tags: ['navigation', 'product'],
  },
  {
    id: 'docs-2025-interface-permissions',
    slug: 'interface-permissions-and-soft-locks',
    title: 'Interface permissions and soft locks',
    summary:
      'Patterns for showing restricted knowledge without flattening the rest of the archive into anonymous placeholders.',
    publishedAt: '2025-11-03',
    requiredRole: 'member',
    eyebrow: 'Access memo',
    tags: ['permissions', 'ui'],
  },
  {
    id: 'docs-2025-reference-taxonomy',
    slug: 'reference-taxonomy-for-shared-systems',
    title: 'Reference taxonomy for shared systems',
    summary:
      'A taxonomy pass for deciding what belongs in release notes, references, and archive writing once the documentation surface grows.',
    publishedAt: '2025-09-14',
    requiredRole: 'pro',
    eyebrow: 'Planning draft',
    tags: ['taxonomy', 'docs'],
  },
];

export const docsHomeGroupsMock: MockDocsArchiveGroup[] = [
  {
    id: 'docs-group-2026',
    label: '2026',
    description: 'Recent releases, interface studies, and gated working notes.',
    articles: docs2026Articles,
  },
  {
    id: 'docs-group-2025',
    label: '2025',
    description: 'Earlier groundwork that shaped the current archive and navigation patterns.',
    articles: docs2025Articles,
  },
];
