import { userEntityMock } from '@/lib/mock/entities/user.mock';
import { docsHomeGroupsMock } from '@/lib/mock/pages/docs/home/docs-home-sections.mock';
import type {
  MockDocsArchiveGroup,
  MockSectionIntro,
  MockViewer,
} from '@/lib/mock/shared/mock-types';

export const docsHomeIntroMock: MockSectionIntro = {
  eyebrow: 'Docs archive',
  title: 'Published notes, references, and gated drafts',
  description:
    'A single-column archive for released writing, editorial experiments, and restricted pieces that still need to remain structurally visible.',
};

export const docsHomeViewerMock: MockViewer = {
  id: userEntityMock.id,
  name: userEntityMock.name,
  role: userEntityMock.role,
  accessRole: userEntityMock.accessRole,
};

export const docsHomePageMock: {
  intro: MockSectionIntro;
  groups: MockDocsArchiveGroup[];
  viewer: MockViewer;
} = {
  intro: docsHomeIntroMock,
  groups: docsHomeGroupsMock,
  viewer: docsHomeViewerMock,
};
