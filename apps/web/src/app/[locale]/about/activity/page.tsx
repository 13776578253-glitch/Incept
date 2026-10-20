import { AboutActivityFeature } from '@/features/about/activity';
import type { AppLocale } from '@/i18n/config/locales';
import { getActivityYears, getGitHubActivity } from '@/server/activity/github';
import { getWritingActivity } from '@/server/activity/writing';

export default async function AboutActivityPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  const years = getActivityYears();
  const initialGitActivity = await getGitHubActivity({
    scope: 'account',
    period: 'all',
  });
  const initialWritingActivity = await getWritingActivity({ period: 'all' });

  return (
    <AboutActivityFeature
      backHref={`/${locale}/about`}
      initialGitActivity={initialGitActivity}
      initialWritingActivity={initialWritingActivity}
      gitYears={years}
    />
  );
}
