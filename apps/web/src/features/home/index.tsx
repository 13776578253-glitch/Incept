import type { AppLocale } from '@/i18n/config/locales';
import { homePageMock } from '@/lib/mock/pages/home/home-page.mock';
import { HomeBlogList } from '@/features/home/components/home-blog-list';
import { HomeBottomSection } from '@/features/home/components/home-bottom-section';
import { HomeHero } from '@/features/home/components/home-hero';

type HomePageFeatureProps = {
  locale: AppLocale;
};

export function HomePageFeature({ locale }: HomePageFeatureProps) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 md:px-8 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <HomeHero
        intro={homePageMock.intro}
        statements={homePageMock.heroStatements}
      />
      <HomeBlogList entries={homePageMock.blogEntries} locale={locale} />
      <HomeBottomSection section={homePageMock.bottomSection} />
    </div>
  );
}
