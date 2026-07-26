'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ActivityDay,
  GitHubActivityPeriod,
  GitHubActivityResult,
  GitHubActivityScope,
  WritingActivityData,
} from './activity-data';

const gitActivityClassNames = [
  'bg-[#edf3ee] dark:bg-[#171f19]',
  'bg-[#b9d8be] dark:bg-[#1f6230]',
  'bg-[#6fb77b] dark:bg-[#328649]',
  'bg-[#2f7d43] dark:bg-[#63c878]',
];

const writingActivityClassNames = [
  'bg-[#f5f0e9] dark:bg-[#231d18]',
  'bg-[#e8cda9] dark:bg-[#6e4826]',
  'bg-[#c99158] dark:bg-[#a86732]',
  'bg-[#9b5c2e] dark:bg-[#d58a4a]',
];

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
});

function getWeekdayIndex(date: string) {
  const weekday = dayFormatter.format(new Date(`${date}T00:00:00.000Z`));
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
}

function getContributionLevel(count: number, maximumCount: number) {
  if (count === 0) return 0;
  if (maximumCount <= 1) return 1;
  return Math.min(3, Math.max(1, Math.ceil((count / maximumCount) * 3)));
}

function createCalendarWeeks(days: ActivityDay[]) {
  if (!days.length) return [] as Array<Array<ActivityDay | null>>;

  const cells: Array<ActivityDay | null> = Array.from(
    { length: getWeekdayIndex(days[0].date) },
    () => null,
  );
  cells.push(...days);

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
}

function ActivityCalendar({
  days,
  colorClassNames,
  useFixedLevels = false,
}: {
  days: ActivityDay[];
  colorClassNames: string[];
  useFixedLevels?: boolean;
}) {
  const weeks = createCalendarWeeks(days);
  const maximumCount = Math.max(0, ...days.map((day) => day.count));

  return (
    <div className="min-w-[36rem]" aria-hidden="true">
      <div
        className="ml-10 grid text-[0.68rem] text-[var(--color-nav-muted)]"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week, index) => {
          const monthStart = week.find(
            (day) => day && (index === 0 || day.date.slice(8) === '01'),
          );

          return <span key={index}>{monthStart ? monthFormatter.format(new Date(`${monthStart.date}T00:00:00.000Z`)) : ''}</span>;
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-[2.5rem_minmax(0,1fr)] gap-1.5">
        <div className="grid grid-rows-7 text-right text-[0.68rem] leading-none text-[var(--color-nav-muted)]">
          <span className="self-center">Mon</span>
          <span />
          <span className="self-center">Wed</span>
          <span />
          <span className="self-center">Fri</span>
          <span />
          <span />
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 auto-cols-fr gap-1"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {weeks.flatMap((week) =>
            week.map((day, index) => (
              <span
                key={day?.date ?? `empty-${index}`}
                className={`aspect-square rounded-[2px] ${
                  day
                    ? colorClassNames[useFixedLevels ? day.count : getContributionLevel(day.count, maximumCount)]
                    : 'bg-transparent'
                }`}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityPeriodPicker({
  years,
  selectedPeriod,
  onSelect,
}: {
  years: readonly number[];
  selectedPeriod: GitHubActivityPeriod;
  onSelect: (period: GitHubActivityPeriod) => void;
}) {
  const periods: Array<{ label: string; value: GitHubActivityPeriod }> = [
    { label: 'All', value: 'all' },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];

  return (
    <aside className="flex gap-2 border-b border-[var(--color-border)] pb-4 xl:flex-col xl:gap-1.5 xl:border-b-0 xl:pb-0">
      {periods.map(({ label, value }) => {
        const isSelected = value === selectedPeriod;

        return (
          <button
            key={label}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(value)}
            className={`w-full rounded-[8px] border border-transparent px-4 py-3 text-left text-[0.82rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] ${
              isSelected
                ? 'bg-[var(--color-nav-item-hover)] font-medium text-[var(--color-text)]'
                : 'text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </aside>
  );
}

function ActivityScopePicker({
  selectedScope,
  onSelect,
  t,
}: {
  selectedScope: GitHubActivityScope;
  onSelect: (scope: GitHubActivityScope) => void;
  t: ReturnType<typeof useTranslations<'about'>>;
}) {
  return (
    <div className="mt-3 flex items-center gap-1 rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-text)_3%,transparent)] p-1">
      {(['account', 'repository'] as const).map((scope) => {
        const isSelected = scope === selectedScope;

        return (
          <button
            key={scope}
            type="button"
            onClick={() => onSelect(scope)}
            aria-pressed={isSelected}
            className={`rounded-[6px] px-2.5 py-1 text-[0.72rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] ${
              isSelected
                ? 'bg-[var(--color-bg)] font-medium text-[var(--color-text)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-text)_12%,transparent)]'
                : 'text-[var(--color-nav-dropdown-description)] hover:text-[var(--color-text)]'
            }`}
          >
            {t(`activity.git.scopes.${scope}`)}
          </button>
        );
      })}
    </div>
  );
}

function ActivityLegend({ colorClassNames }: { colorClassNames: string[] }) {
  return (
    <span className="flex items-center gap-1.5" aria-label="Contribution intensity">
      <span>Less</span>
      {colorClassNames.map((className, index) => (
        <i key={index} className={`size-2 rounded-[2px] ${className}`} />
      ))}
      <span>More</span>
    </span>
  );
}

export function AboutActivityFeature({
  backHref,
  initialGitActivity,
  initialWritingActivity,
  gitYears,
}: {
  backHref: string;
  initialGitActivity: GitHubActivityResult;
  initialWritingActivity: WritingActivityData;
  gitYears: readonly number[];
}) {
  const t = useTranslations('about');
  const [selectedGitScope, setSelectedGitScope] = useState<GitHubActivityScope>('account');
  const [selectedGitPeriod, setSelectedGitPeriod] = useState<GitHubActivityPeriod>('all');
  const [gitActivity, setGitActivity] = useState(initialGitActivity);
  const [isGitLoading, setIsGitLoading] = useState(false);
  const [selectedWritingPeriod, setSelectedWritingPeriod] = useState<GitHubActivityPeriod>('all');
  const [writingActivity, setWritingActivity] = useState(initialWritingActivity);
  const [isWritingLoading, setIsWritingLoading] = useState(false);

  async function loadGitActivity(scope: GitHubActivityScope, period: GitHubActivityPeriod) {
    setSelectedGitScope(scope);
    setSelectedGitPeriod(period);
    setIsGitLoading(true);

    try {
      const response = await fetch(`/api/internal/activity/github?scope=${scope}&period=${period}`);
      const result = response.ok
        ? ((await response.json()) as GitHubActivityResult)
        : ({ status: 'unavailable' } as const);
      setGitActivity(result);
    } catch {
      setGitActivity({ status: 'unavailable' });
    } finally {
      setIsGitLoading(false);
    }
  }

  async function loadWritingActivity(period: GitHubActivityPeriod) {
    setSelectedWritingPeriod(period);
    setIsWritingLoading(true);

    try {
      const response = await fetch(`/api/internal/activity/writing?period=${period}`);
      if (!response.ok) {
        throw new Error('Writing activity request failed.');
      }

      setWritingActivity((await response.json()) as WritingActivityData);
    } catch {
      // Keep the previous activity visible when a transient request fails.
    } finally {
      setIsWritingLoading(false);
    }
  }

  const gitData = gitActivity.status === 'available' ? gitActivity.data : null;
  const gitRangeLabel = gitData
    ? gitData.range.kind === 'rolling'
      ? t('activity.git.rollingRange', { end: gitData.range.to })
      : t('activity.git.calendarRange', { year: gitData.range.year })
    : t('activity.git.unavailable');
  const gitHeading = gitData
    ? gitData.range.kind === 'rolling'
      ? t('activity.git.totalRolling', { count: gitData.totalCount })
      : t('activity.git.totalCalendar', {
          count: gitData.totalCount,
          year: gitData.range.year,
        })
    : t('activity.git.unavailable');
  const writingRangeLabel = writingActivity.range.kind === 'rolling'
    ? t('activity.blog.rollingRange', { end: writingActivity.range.to })
    : t('activity.blog.calendarRange', { year: writingActivity.range.year });

  return (
    <main className="mx-auto w-full max-w-[1060px] px-6 pb-24 pt-10 md:px-8 md:pb-32 md:pt-12 xl:px-10">
      <section className="max-w-[1060px]">
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <span aria-hidden="true" className="text-[1.125rem] leading-none">
            &larr;
          </span>
          {t('backToAbout')}
        </Link>
        <div className="mb-7 flex items-end justify-between gap-5">
          <div>
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {t('activity.eyebrow')}
            </p>
            <h1 className="mt-2 text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.28rem]">
              {t('activity.title')}
            </h1>
          </div>
          {/* <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--color-nav-muted)]">
            {t('activity.preview')}
          </span> */}
        </div>

        <div className="grid gap-10 md:gap-12">
          <section className="grid gap-5 border-t border-[var(--color-border)] pt-5 xl:grid-cols-[minmax(0,1fr)_9rem] xl:gap-6">
            <div>
              <div>
                <p className="text-[0.74rem] font-medium uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
                  {t('activity.git.eyebrow')}
                </p>
                <h2 className="mt-2 text-[1.05rem] font-medium text-[var(--color-text)]">
                  {gitHeading}
                </h2>
                <ActivityScopePicker
                  selectedScope={selectedGitScope}
                  onSelect={(scope) => void loadGitActivity(scope, selectedGitPeriod)}
                  t={t}
                />
              </div>

              <div className="mt-6 overflow-x-auto rounded-[14px] border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-text)_1.5%,transparent)] p-4 md:p-5">
                {gitData ? (
                  <ActivityCalendar days={gitData.days} colorClassNames={gitActivityClassNames} />
                ) : (
                  <div className="grid min-h-40 place-items-center text-[0.82rem] text-[var(--color-nav-muted)]">
                    {t('activity.git.unavailable')}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 text-[0.76rem] text-[var(--color-nav-muted)]">
                <span>
                  {gitData?.totalCount === 0 ? t('activity.git.empty') : gitRangeLabel}
                  {isGitLoading ? ` ${t('activity.git.loading')}` : ''}
                </span>
                <ActivityLegend colorClassNames={gitActivityClassNames} />
              </div>
            </div>
            <ActivityPeriodPicker
              years={gitYears}
              selectedPeriod={selectedGitPeriod}
              onSelect={(period) => void loadGitActivity(selectedGitScope, period)}
            />
          </section>

          <section className="grid gap-5 border-t border-[var(--color-border)] pt-5 xl:grid-cols-[minmax(0,1fr)_9rem] xl:gap-6">
            <div>
              <div>
                <p className="text-[0.74rem] font-medium uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
                  {t('activity.blog.eyebrow')}
                </p>
                <h2 className="mt-2 text-[1.05rem] font-medium text-[var(--color-text)]">
                  {t('activity.blog.title')}
                </h2>
              </div>

              <div className="mt-6 overflow-x-auto rounded-[14px] border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-text)_1.5%,transparent)] p-4 md:p-5">
                <ActivityCalendar
                  days={writingActivity.days}
                  colorClassNames={writingActivityClassNames}
                  useFixedLevels
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 text-[0.76rem] text-[var(--color-nav-muted)]">
                <span>
                  {writingRangeLabel} · {t('activity.blog.summary', {
                    articles: writingActivity.articleCount,
                    units: writingActivity.writingUnits,
                  })}
                  {isWritingLoading ? ` ${t('activity.blog.loading')}` : ''}
                </span>
                <ActivityLegend colorClassNames={writingActivityClassNames} />
              </div>
            </div>
            <ActivityPeriodPicker
              years={gitYears}
              selectedPeriod={selectedWritingPeriod}
              onSelect={(period) => void loadWritingActivity(period)}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
