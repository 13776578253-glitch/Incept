import type { MockNavigationItem } from '@/lib/mock/shared/mock-types';

export const navigationEntitiesMock: MockNavigationItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/home',
  },
  {
    id: 'docs',
    label: 'Docs',
    href: '/docs',
    description: 'Archive, reading pages, and structured reference content.',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    href: '/workspace',
  },
  {
    id: 'resources',
    label: 'Resources',
    href: '/resources',
  },
  {
    id: 'about',
    label: 'About',
    href: '/about',
  },
];

