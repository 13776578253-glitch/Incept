'use client';

import { useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config/locales';
import type {
  MockBlogEntry,
  MockBottomSection,
  MockHeroStatement,
  MockSectionIntro,
} from '@/lib/mock/shared/mock-types';
import { HomeBlogList } from '@/features/home/components/home-blog-list';
import { HomeBottomSection } from '@/features/home/components/home-bottom-section';
import { HomeHero } from '@/features/home/components/home-hero';

type HomePageFeatureProps = {
  locale: AppLocale;
};

// TODO: 界面待完善，暂时先展示 mock 数据
export function HomePageFeature({ locale }: HomePageFeatureProps) {
  const t = useTranslations('home');

  const intro: MockSectionIntro = {
    eyebrow: t('intro.eyebrow'),
    title: t('intro.title'),
    description: t('intro.description'),
  };
  const statements: MockHeroStatement[] = [
    {
      id: 'home-hero-clarity',
      label: t('statements.clarity.label'),
      value: t('statements.clarity.value'),
    },
    {
      id: 'home-hero-rhythm',
      label: t('statements.rhythm.label'),
      value: t('statements.rhythm.value'),
    },
    {
      id: 'home-hero-mock',
      label: t('statements.mockFirst.label'),
      value: t('statements.mockFirst.value'),
    },
  ];
  const entries: MockBlogEntry[] = [
    {
      id: 'home-blog-shell-boundaries',
      title: t('writing.entries.shellBoundaries.title'),
      summary: t('writing.entries.shellBoundaries.summary'),
      href: '/test',
      imageSrc: '/mock/home/home-blog-01.svg',
      imageAlt: t('writing.entries.shellBoundaries.imageAlt'),
    },
    {
      id: 'home-blog-navigation-review',
      title: t('writing.entries.navigationReview.title'),
      summary: t('writing.entries.navigationReview.summary'),
      href: '/test',
      imageSrc: '/mock/home/home-blog-02.svg',
      imageAlt: t('writing.entries.navigationReview.imageAlt'),
    },
    {
      id: 'home-blog-document-rhythm',
      title: t('writing.entries.documentRhythm.title'),
      summary: t('writing.entries.documentRhythm.summary'),
      href: '/test',
      imageSrc: '/mock/home/home-blog-03.svg',
      imageAlt: t('writing.entries.documentRhythm.imageAlt'),
    },
    {
      id: 'home-blog-mock-system',
      title: t('writing.entries.mockSystem.title'),
      summary: t('writing.entries.mockSystem.summary'),
      href: '/test',
      imageSrc: '/mock/home/home-blog-04.svg',
      imageAlt: t('writing.entries.mockSystem.imageAlt'),
    },
  ];
  const bottomSection: MockBottomSection = {
    title: t('closing.title'),
    description: t('closing.description'),
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 md:px-8 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <HomeHero
        intro={intro}
        statements={statements}
      />
      <HomeBlogList
        entries={entries}
        locale={locale}
        eyebrow={t('writing.eyebrow')}
        title={t('writing.title')}
      />
      <HomeBottomSection
        section={bottomSection}
        eyebrow={t('closing.eyebrow')}
      />
    </div>
  );
}
