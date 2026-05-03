import type { MockCard } from '@/lib/mock/shared/mock-types';

export const postEntitiesMock: MockCard[] = [
  {
    id: 'post-system-overview',
    title: 'System overview',
    description: 'High-level structure, architecture, and product framing notes.',
    tone: 'default',
  },
  {
    id: 'post-interface-rules',
    title: 'Interface rules',
    description: 'Design constraints and layout decisions for the current web shell.',
    tone: 'muted',
  },
];

