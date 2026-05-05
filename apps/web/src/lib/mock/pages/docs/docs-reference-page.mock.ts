import type {
  MockDocsNavGroup,
  MockDocsOutlineItem,
  MockDocsReferencePage,
  MockDocsSection,
} from '@/lib/mock/shared/mock-types';

const docsReferenceSidebarGroups: MockDocsNavGroup[] = [
  {
    id: 'docs-nav-getting-started',
    label: 'Getting started',
    defaultOpen: true,
    items: [
      { id: 'docs-nav-overview', label: 'Overview', href: '/en/docs' },
      { id: 'docs-nav-quickstart', label: 'Quickstart', href: '/en/docs' },
    ],
  },
  {
    id: 'docs-nav-reference',
    label: 'Reference',
    defaultOpen: true,
    items: [
      {
        id: 'docs-nav-reference-shells',
        label: 'Document shells',
        href: '/en/docs/reference',
        active: true,
      },
      { id: 'docs-nav-reference-patterns', label: 'Reading patterns', href: '/en/docs' },
      { id: 'docs-nav-reference-access', label: 'Access notes', href: '/en/docs' },
    ],
  },
  {
    id: 'docs-nav-systems',
    label: 'Systems',
    defaultOpen: false,
    items: [
      { id: 'docs-nav-systems-navigation', label: 'Navigation', href: '/en/docs' },
      { id: 'docs-nav-systems-workspace', label: 'Workspace', href: '/en/docs' },
    ],
  },
];

const docsReferenceSections: MockDocsSection[] = [
  {
    id: 'overview',
    title: 'Why a reusable document shell matters',
    blocks: [
      {
        id: 'overview-paragraph-1',
        type: 'paragraph',
        text: 'This reference page is the first pass at a durable reading surface for the docs area. It needs to feel stable enough for long-form articles, but flexible enough to support both navigated documents and simpler standalone notes.',
      },
      {
        id: 'overview-paragraph-2',
        type: 'paragraph',
        text: 'The goal is not to mimic a generic docs product. It is to establish a readable shell with clear fixed edges: navigation on the left when needed, content in the middle, and a light outline rail on the right.',
      },
      {
        id: 'overview-callout',
        type: 'callout',
        tone: 'note',
        title: 'Design intent',
        text: 'This page is interface-first and mock-first. We are validating structure, reading rhythm, and interaction boundaries before any real article system is wired in.',
      },
    ],
  },
  {
    id: 'layout-modes',
    title: 'Two document modes, one content model',
    description: 'Both page shapes should read from the same mock article data.',
    blocks: [
      {
        id: 'layout-modes-paragraph-1',
        type: 'paragraph',
        text: 'Some documents need a fixed navigational frame because they belong to a larger section tree. Others should open as quieter references with no left rail at all. The shell must support both without forcing the article body to care which mode it is in.',
      },
      {
        id: 'layout-modes-list',
        type: 'list',
        items: [
          'Sidebar mode reserves the left column for grouped navigation and current-page context.',
          'Content-only mode removes the left rail but keeps the article body and right-side outline aligned.',
          'The same section data should render in either mode with no changes to the article blocks themselves.',
        ],
      },
    ],
  },
  {
    id: 'sidebar-behavior',
    title: 'Sidebar behavior should feel fixed and deliberate',
    blocks: [
      {
        id: 'sidebar-behavior-paragraph-1',
        type: 'paragraph',
        text: 'The left rail is not a floating convenience menu. It is part of the document frame. Group labels need clear hierarchy, the current page needs a quiet highlight, and collapsed groups should reduce noise without making the structure feel hidden.',
      },
      {
        id: 'sidebar-behavior-paragraph-2',
        type: 'paragraph',
        text: 'In this first pass the groups can expand and collapse, but their visual treatment stays restrained: small text, careful spacing, and no dashboard-style panels.',
      },
      {
        id: 'sidebar-behavior-callout',
        type: 'callout',
        tone: 'tip',
        title: 'Implementation note',
        text: 'Desktop keeps the sidebar fixed within the reading shell. Smaller screens can hide it entirely until a dedicated mobile docs navigation is designed.',
      },
    ],
  },
  {
    id: 'outline-rail',
    title: 'The right rail should only track the article',
    blocks: [
      {
        id: 'outline-rail-paragraph-1',
        type: 'paragraph',
        text: 'The right rail is intentionally narrower in scope than the left navigation. It only reflects the current article. As the reader moves through the page, the active heading changes and the rail quietly confirms where they are.',
      },
      {
        id: 'outline-rail-list',
        type: 'list',
        items: [
          'Track section ids already rendered in the document body.',
          'Update the active state on scroll and at page bottom.',
          'Avoid extra cards, summaries, or decorative widgets in the rail for now.',
        ],
      },
    ],
  },
  {
    id: 'mock-assembly',
    title: 'Mock-first assembly keeps the interface testable',
    blocks: [
      {
        id: 'mock-assembly-paragraph-1',
        type: 'paragraph',
        text: 'The archive page and the reference page should both hang from the same mock system so layout work stays easy to pressure-test. Page-level mocks should decide which shell to use, what navigation groups appear, and which article sections render.',
      },
      {
        id: 'mock-assembly-paragraph-2',
        type: 'paragraph',
        text: 'That gives us a clean test surface: we can flip a reference article from sidebar mode to content-only mode by changing a single field, instead of rewriting the article or the route.',
      },
      {
        id: 'mock-assembly-callout',
        type: 'callout',
        tone: 'warning',
        title: 'Guardrail',
        text: 'Do not let the shell assumptions leak into the body block schema. Article content should stay portable across future page variants.',
      },
    ],
  },
];

const docsReferenceOutline: MockDocsOutlineItem[] = docsReferenceSections.map(
  (section) => ({
    id: section.id,
    label: section.title,
  }),
);

export const docsReferencePageMock: MockDocsReferencePage = {
  id: 'docs-reference-shells',
  slug: 'document-shells',
  layoutMode: 'sidebar',
  eyebrow: 'Docs reference',
  title: 'Building a reusable document shell for the docs surface',
  description:
    'A test article for validating fixed navigation, a reading column, and an outline rail before the reference pattern becomes the default docs interface.',
  outlineLabel: 'On this page',
  sidebarGroups: docsReferenceSidebarGroups,
  outline: docsReferenceOutline,
  sections: docsReferenceSections,
};

export const docsReferenceContentOnlyPageMock: MockDocsReferencePage = {
  ...docsReferencePageMock,
  id: 'docs-reference-shells-content-only',
  layoutMode: 'contentOnly',
};
