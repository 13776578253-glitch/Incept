import { userEntityMock } from '@/lib/mock/entities/user.mock';
import { docsArchiveGroupsMock } from '@/lib/mock/pages/docs/docs-sections.mock';
import type {
  MockDocsArchiveGroup,
  MockSectionIntro,
  MockViewer,
} from '@/lib/mock/shared/mock-types';

export const docsArchiveIntroMock: MockSectionIntro = {
  eyebrow: 'Docs archive',
  title: 'Published notes, references, and gated drafts',
  description:
    'A single-column archive for released writing, editorial experiments, and restricted pieces that still need to remain structurally visible.',
};

export const docsArchiveViewerMock: MockViewer = {
  id: userEntityMock.id,
  name: userEntityMock.name,
  role: userEntityMock.role,
  accessRole: userEntityMock.accessRole,
};

export const docsArchivePageMock: {
  intro: MockSectionIntro;
  groups: MockDocsArchiveGroup[];
  viewer: MockViewer;
} = {
  intro: docsArchiveIntroMock,
  groups: docsArchiveGroupsMock,
  viewer: docsArchiveViewerMock,
};
