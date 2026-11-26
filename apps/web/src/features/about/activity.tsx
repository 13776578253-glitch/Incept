'use client';

import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ActivityDay,
  GitHubActivityPeriod,
  GitHubActivityResult,
  GitHubActivityScope,
  WritingActivityData,
} from './activity-data';

const EMPTY_CELL_BACKGROUND =
  'color-mix(in oklab, var(--color-text) 6%, var(--color-surface-card, var(--color-bg)))';

const gitActivityBackgrounds = [
  EMPTY_CELL_BACKGROUND,
  'color-mix(in oklab, #349f74 32%, var(--color-surface-card, var(--color-bg)))',
  'color-mix(in oklab, #349f74 60%, var(--color-surface-card, var(--color-bg)))',
  'color-mix(in oklab, #349f74 88%, var(--color-surface-card, var(--color-bg)))',
];

const writingActivityBackgrounds = [
  EMPTY_CELL_BACKGROUND,
  'color-mix(in oklab, #c78548 30%, var(--color-surface-card, var(--color-bg)))',
  'color-mix(in oklab, #c78548 58%, var(--color-surface-card, var(--color-bg)))',
  'color-mix(in oklab, #c78548 86%, var(--color-surface-card, var(--color-bg)))',
];

type ActivityKind = 'git' | 'writing';

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

function formatDayReadout(day: ActivityDay, kind: ActivityKind) {
  if (kind === 'writing') {
    const articleCount =
      'articleCount' in day && typeof day.articleCount === 'number'
        ? day.articleCount
        : day.count;
    return `${day.date} · ${articleCount} ${articleCount === 1 ? 'post' : 'posts'}`;
  }

  return `${day.date} · ${day.count} ${day.count === 1 ? 'contribution' : 'contributions'}`;
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

function getCalendarMonthLabels(weeks: Array<Array<ActivityDay | null>>) {
  const boundaryMonths = weeks.map((week) => {
    const boundary = week.find((day) => day && day.date.slice(8) === '01');
    return boundary ? monthFormatter.format(new Date(`${boundary.date}T00:00:00.000Z`)) : '';
  });

  if (weeks.length > 0 && !boundaryMonths[0]) {
    const firstBoundaryIndex = boundaryMonths.findIndex((label, index) => index > 0 && label);
    const firstDay = weeks[0].find(Boolean);
    if (firstDay && (firstBoundaryIndex === -1 || firstBoundaryIndex >= 3)) {
      boundaryMonths[0] = monthFormatter.format(new Date(`${firstDay.date}T00:00:00.000Z`));
    }
  }

  return boundaryMonths;
}

function ActivityCalendar({
  days,
  colorBackgrounds,
  kind,
  selectedDate,
  onHoverDay,
  onTogglePinDay,
  useFixedLevels = false,
}: {
  days: ActivityDay[];
  colorBackgrounds: string[];
  kind: ActivityKind;
  selectedDate: string | null;
  onHoverDay: (day: ActivityDay | null) => void;
  onTogglePinDay: (day: ActivityDay) => void;
  useFixedLevels?: boolean;
}) {
  const weeks = createCalendarWeeks(days);
  const monthLabels = getCalendarMonthLabels(weeks);
  const maximumCount = Math.max(0, ...days.map((day) => day.count));

  return (
    <div className="min-w-[36rem]" onMouseLeave={() => onHoverDay(null)}>
      <div
        aria-hidden="true"
        className="ml-10 grid text-[0.68rem] text-[var(--color-nav-muted)]"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {monthLabels.map((label, index) => (
          <span key={index} className="whitespace-nowrap">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-[2.5rem_minmax(0,1fr)] gap-1.5">
        <div
          aria-hidden="true"
          className="grid grid-rows-7 text-right text-[0.68rem] leading-none text-[var(--color-nav-muted)]"
        >
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
          {weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => {
              if (!day) {
                return (
                  <span
                    key={`empty-${weekIndex}-${dayIndex}`}
                    aria-hidden="true"
                    className="aspect-square rounded-[2px] bg-transparent"
                  />
                );
              }

              const level = useFixedLevels
                ? Math.min(3, Math.max(0, day.count))
                : getContributionLevel(day.count, maximumCount);
              const isPinned = selectedDate === day.date;
              const readout = formatDayReadout(day, kind);

              return (
                <button
                  key={day.date}
                  type="button"
                  aria-label={readout}
                  aria-pressed={isPinned}
                  title={readout}
                  onMouseEnter={() => onHoverDay(day)}
                  onFocus={() => onHoverDay(day)}
                  onBlur={() => onHoverDay(null)}
                  onClick={() => onTogglePinDay(day)}
                  style={{ backgroundColor: colorBackgrounds[level] }}
                  className={`aspect-square w-full cursor-pointer rounded-[2px] border-0 p-0 transition-transform duration-100 hover:scale-[1.15] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-text)] ${
                    isPinned ? 'ring-1 ring-[var(--color-text)]' : ''
                  }`}
                />
              );
            }),
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
  label,
  accentDotColor,
}: {
  years: readonly number[];
  selectedPeriod: GitHubActivityPeriod;
  onSelect: (period: GitHubActivityPeriod) => void;
  label: string;
  accentDotColor: string;
}) {
  const periods: Array<{ label: string; value: GitHubActivityPeriod }> = [
    { label: 'All', value: 'all' },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];

  return (
    <aside
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch lg:gap-1"
    >
      {periods.map(({ label: itemLabel, value }) => {
        const isSelected = value === selectedPeriod;

        return (
          <button
            key={itemLabel}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(value)}
            className={`flex items-center justify-between gap-2 rounded-[10px] border px-3 py-1.5 text-left text-[0.8rem] tabular-nums transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] lg:w-full lg:px-3.5 lg:py-2 ${
              isSelected
                ? 'border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'border-transparent text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
            }`}
          >
            <span>{itemLabel}</span>
            {isSelected ? (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accentDotColor }}
              />
            ) : null}
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
    <div
      role="group"
      aria-label={t('activity.git.eyebrow')}
      className="inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--surface-recessed-bg,var(--color-row-bg))] p-0.5"
    >
      {(['account', 'repository', '1002bot'] as const).map((scope) => {
        const isSelected = scope === selectedScope;

        return (
          <button
            key={scope}
            type="button"
            onClick={() => onSelect(scope)}
            aria-pressed={isSelected}
            className={`inline-flex h-[22px] items-center rounded-[6px] px-2 text-[0.68rem] leading-none transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
              isSelected
                ? 'bg-[var(--color-pill-active-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
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

function ActivityLegend({ colorBackgrounds }: { colorBackgrounds: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label="Contribution intensity">
      <span>Less</span>
      {colorBackgrounds.map((backgroundColor, index) => (
        <i
          key={index}
          className="size-2 rounded-[2px]"
          style={{ backgroundColor }}
        />
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
  const [hoveredGitDay, setHoveredGitDay] = useState<ActivityDay | null>(null);
  const [pinnedGitDay, setPinnedGitDay] = useState<ActivityDay | null>(null);

  const [selectedWritingPeriod, setSelectedWritingPeriod] = useState<GitHubActivityPeriod>('all');
  const [writingActivity, setWritingActivity] = useState(initialWritingActivity);
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [hoveredWritingDay, setHoveredWritingDay] = useState<ActivityDay | null>(null);
  const [pinnedWritingDay, setPinnedWritingDay] = useState<ActivityDay | null>(null);

  async function loadGitActivity(scope: GitHubActivityScope, period: GitHubActivityPeriod) {
    setSelectedGitScope(scope);
    setSelectedGitPeriod(period);
    setHoveredGitDay(null);
    setPinnedGitDay(null);
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
    setHoveredWritingDay(null);
    setPinnedWritingDay(null);
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

  const activeGitDay = hoveredGitDay ?? pinnedGitDay;
  const activeWritingDay = hoveredWritingDay ?? pinnedWritingDay;

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 pb-20 pt-8 md:px-8 md:pb-28 md:pt-10 xl:px-10">
      <section className="max-w-[1060px]">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.8125rem] font-medium text-[var(--color-nav-dropdown-description)] transition-colors hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{t('backToAbout')}</span>
        </Link>

        <div className="mb-6 flex items-end justify-between gap-5">
          <div>
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
              {t('activity.eyebrow')}
            </p>
            <h1 className="mt-1.5 text-[1.24rem] font-semibold tracking-[-0.03em] text-[var(--color-text)] md:text-[1.36rem]">
              {t('activity.title')}
            </h1>
          </div>
        </div>

        <div className="grid gap-7 md:gap-8">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:items-start lg:gap-5">
            <div className="min-w-0 rounded-[14px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] p-4 shadow-[var(--shadow-surface-card,0_1px_2px_rgba(0,0,0,0.03))] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
                    {t('activity.git.eyebrow')}
                  </p>
                  <h2 className="mt-1 text-[0.98rem] font-semibold tracking-[-0.02em] text-[var(--color-text)] md:text-[1.04rem]">
                    {gitHeading}
                  </h2>
                </div>

                <ActivityScopePicker
                  selectedScope={selectedGitScope}
                  onSelect={(scope) => void loadGitActivity(scope, selectedGitPeriod)}
                  t={t}
                />
              </div>

              {gitData ? (
                <div
                  className={`mt-4 transition-opacity duration-150 ${isGitLoading ? 'opacity-60' : 'opacity-100'}`}
                >
                  <div className="overflow-x-auto pb-1">
                    <ActivityCalendar
                      days={gitData.days}
                      colorBackgrounds={gitActivityBackgrounds}
                      kind="git"
                      selectedDate={pinnedGitDay?.date ?? null}
                      onHoverDay={setHoveredGitDay}
                      onTogglePinDay={(day) =>
                        setPinnedGitDay((current) => (current?.date === day.date ? null : day))
                      }
                    />
                  </div>
                  <div className="mt-3 flex h-5 items-center justify-between gap-4 text-[0.72rem] text-[var(--color-text-muted)]">
                    <span className="min-w-0 truncate tabular-nums">
                      {activeGitDay ? formatDayReadout(activeGitDay, 'git') : gitRangeLabel}
                    </span>
                    <ActivityLegend colorBackgrounds={gitActivityBackgrounds} />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[10px] border border-[var(--color-border-faint,var(--color-border))] bg-[var(--surface-recessed-bg,var(--color-row-bg))] px-4 py-6 text-[0.82rem] leading-6 text-[var(--color-text-muted)]">
                  {t('activity.git.unavailableNote')}
                </div>
              )}
            </div>

            <ActivityPeriodPicker
              years={gitYears}
              selectedPeriod={selectedGitPeriod}
              onSelect={(period) => void loadGitActivity(selectedGitScope, period)}
              label={`${t('activity.git.eyebrow')} period`}
              accentDotColor="#349f74"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:items-start lg:gap-5">
            <div className="min-w-0 rounded-[14px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] p-4 shadow-[var(--shadow-surface-card,0_1px_2px_rgba(0,0,0,0.03))] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[var(--color-nav-muted)]">
                    {t('activity.blog.eyebrow')}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <h2 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[var(--color-text)] md:text-[1.04rem]">
                      {t('activity.blog.title')}
                    </h2>
                    <span className="text-[0.76rem] tabular-nums text-[var(--color-text-muted)]">
                      {t('activity.blog.summary', {
                        articles: writingActivity.articleCount,
                        units: writingActivity.writingUnits,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 transition-opacity duration-150 ${isWritingLoading ? 'opacity-60' : 'opacity-100'}`}
              >
                <div className="overflow-x-auto pb-1">
                  <ActivityCalendar
                    days={writingActivity.days}
                    colorBackgrounds={writingActivityBackgrounds}
                    kind="writing"
                    selectedDate={pinnedWritingDay?.date ?? null}
                    onHoverDay={setHoveredWritingDay}
                    onTogglePinDay={(day) =>
                      setPinnedWritingDay((current) => (current?.date === day.date ? null : day))
                    }
                    useFixedLevels
                  />
                </div>
                <div className="mt-3 flex h-5 items-center justify-between gap-4 text-[0.72rem] text-[var(--color-text-muted)]">
                  <span className="min-w-0 truncate tabular-nums">
                    {activeWritingDay
                      ? formatDayReadout(activeWritingDay, 'writing')
                      : writingRangeLabel}
                  </span>
                  <ActivityLegend colorBackgrounds={writingActivityBackgrounds} />
                </div>
              </div>
            </div>

            <ActivityPeriodPicker
              years={gitYears}
              selectedPeriod={selectedWritingPeriod}
              onSelect={(period) => void loadWritingActivity(period)}
              label={`${t('activity.blog.eyebrow')} period`}
              accentDotColor="#c78548"
            />
          </section>
        </div>
      </section>
    </div>
  );
}
