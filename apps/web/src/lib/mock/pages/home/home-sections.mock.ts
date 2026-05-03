import type {
  MockBlogEntry,
  MockBottomSection,
  MockHeroStatement,
} from '@/lib/mock/shared/mock-types';

export const homeHeroStatementsMock: MockHeroStatement[] = [
  {
    id: 'home-hero-clarity',
    label: 'Clarity',
    value: 'Every page type starts from an explicit shell rather than ad-hoc layout code.',
  },
  {
    id: 'home-hero-rhythm',
    label: 'Rhythm',
    value: 'Readable spacing and restrained typography are treated as product features, not polish.',
  },
  {
    id: 'home-hero-mock',
    label: 'Mock-first',
    value: 'Realistic mock content is used early to pressure-test structure before backend work begins.',
  },
];

export const homeBlogEntriesMock: MockBlogEntry[] = [
  {
    id: 'home-blog-shell-boundaries',
    title: 'Designing page shells before filling content',
    summary:
      'A short note on why the current rebuild starts with clear page classes, stable navigation, and mock-driven validation before feature expansion.',
    href: '/test',
    imageSrc: '/mock/home/home-blog-01.svg',
    imageAlt: 'Abstract shell diagram placeholder',
  },
  {
    id: 'home-blog-navigation-review',
    title: 'Navigation review as a product surface',
    summary:
      'The top bar is no longer treated as scaffolding. It is being refined as a stable, readable product surface that drives the rest of the site.',
    href: '/test',
    imageSrc: '/mock/home/home-blog-02.svg',
    imageAlt: 'Navigation refinement placeholder',
  },
  {
    id: 'home-blog-document-rhythm',
    title: 'Making a homepage feel like a documentation page',
    summary:
      'This pass explores how a home page can stay minimal and editorial without collapsing into either a dashboard or a generic marketing landing page.',
    href: '/test',
    imageSrc: '/mock/home/home-blog-03.svg',
    imageAlt: 'Editorial layout placeholder',
  },
  {
    id: 'home-blog-mock-system',
    title: 'Building a mock system that can survive refactors',
    summary:
      'Entities, page-level assemblies, and test scenarios are split apart so the interface can keep evolving without turning mock data into clutter.',
    href: '/test',
    imageSrc: '/mock/home/home-blog-04.svg',
    imageAlt: 'Mock data structure placeholder',
  },
];

export const homeBottomSectionMock: MockBottomSection = {
  title: 'This area is intentionally lightweight for now',
  description:
    'The closing section is reserved for future navigation, release notes, or project context. For this pass it simply anchors the page and verifies the end-of-page rhythm.',
};
