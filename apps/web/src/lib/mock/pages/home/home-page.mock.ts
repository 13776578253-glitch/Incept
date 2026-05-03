import type { MockSectionIntro } from '@/lib/mock/shared/mock-types';
import {
  homeBlogEntriesMock,
  homeBottomSectionMock,
  homeHeroStatementsMock,
} from '@/lib/mock/pages/home/home-sections.mock';

export const homePageIntroMock: MockSectionIntro = {
  eyebrow: 'Incept',
  title: 'A quieter interface with stronger boundaries',
  description:
    'The first real home page is being used to validate the simple-page shell, editorial rhythm, and a mock-first content system before the rest of the site is filled in.',
};

export const homePageMock = {
  intro: homePageIntroMock,
  heroStatements: homeHeroStatementsMock,
  blogEntries: homeBlogEntriesMock,
  bottomSection: homeBottomSectionMock,
};
