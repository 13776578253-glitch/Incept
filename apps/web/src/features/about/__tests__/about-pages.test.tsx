import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps, ImgHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhAbout from '../../../messages/zh/about.json';
import type { GitHubActivityResult, WritingActivityData } from '../activity-data';
import { AboutActivityFeature } from '../activity';
import { AboutFeature } from '../index';

function resolveMessage(templateKey: string, values?: Record<string, string | number>) {
  const parts = templateKey.split('.');
  let current: unknown = zhAbout;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return templateKey;
    }
  }
  if (typeof current !== 'string') {
    return templateKey;
  }
  if (!values) {
    return current;
  }
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    current,
  );
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    resolveMessage(key, values),
}));

vi.mock('@/components/layouts/navigation-link', () => ({
  NavigationLink: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    className,
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} className={className} />
  ),
}));

vi.mock('@/features/docs/shared/renderers', () => ({
  DocsBlockRenderer: ({ block }: { block: { id: string } }) => (
    <div data-testid={`block-${block.id}`} />
  ),
}));

const initialGitActivity: GitHubActivityResult = {
  status: 'available',
  data: {
    scope: 'account',
    period: 'all',
    range: {
      kind: 'rolling',
      from: '2026-11-23',
      to: '2026-11-25',
      year: 2026,
    },
    totalCount: 6,
    days: [
      { date: '2026-11-23', count: 0 },
      { date: '2026-11-24', count: 1 },
      { date: '2026-11-25', count: 5 },
    ],
  },
};

const initialWritingActivity: WritingActivityData = {
  range: {
    kind: 'rolling',
    from: '2026-11-23',
    to: '2026-11-25',
    year: 2026,
  },
  articleCount: 3,
  writingUnits: 3600,
  days: [
    { date: '2026-11-23', count: 0, articleCount: 0, writingUnits: 0 },
    { date: '2026-11-24', count: 2, articleCount: 1, writingUnits: 1200 },
    { date: '2026-11-25', count: 3, articleCount: 2, writingUnits: 2400 },
  ],
};

describe('AboutFeature', () => {
  it('renders tightened hero, accent bar sections, and lightweight activity link', () => {
    const { container } = render(
      <AboutFeature
        activityHref="/zh/about/activity"
        sections={[
          {
            id: 'background',
            title: '背景介绍',
            blocks: [],
          },
        ]}
      />,
    );

    const heading = screen.getByRole('heading', { name: zhAbout.identity.name });
    expect(heading).toBeInTheDocument();

    const accentBar = container.querySelector('.bg-\\[var\\(--color-accent\\)\\]');
    expect(accentBar).not.toBeNull();

    const activityLink = screen.getByRole('link', { name: zhAbout.activityLink });
    expect(activityLink).toHaveAttribute('href', '/zh/about/activity');
    expect(activityLink.className).toContain('inline-flex');
    expect(activityLink.className).not.toContain('rounded-[14px]');
    expect(activityLink.className).not.toContain('border');
  });
});

describe('AboutActivityFeature', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders theme-adaptive color-mix heatmaps, compact pills, and English tile readouts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'available',
        data: {
          scope: 'repository',
          period: 2026,
          range: { kind: 'calendar', from: '2026-01-01', to: '2026-12-31', year: 2026 },
          totalCount: 3,
          days: [{ date: '2026-01-01', count: 3 }],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <AboutActivityFeature
        backHref="/zh/about"
        initialGitActivity={initialGitActivity}
        initialWritingActivity={initialWritingActivity}
        gitYears={[2026, 2025]}
      />,
    );

    expect(screen.getByRole('link', { name: zhAbout.backToAbout })).toHaveAttribute(
      'href',
      '/zh/about',
    );
    expect(container.innerHTML).not.toContain('#ebedf0');
    expect(container.innerHTML).not.toContain('#161b22');

    const gitTile = screen.getByRole('button', { name: '2026-11-25 · 5 contributions' });
    expect(gitTile.getAttribute('style')).toContain('color-mix');
    fireEvent.mouseEnter(gitTile);

    const gitCard = gitTile.closest('section');
    expect(gitCard).not.toBeNull();
    expect(within(gitCard as HTMLElement).getByText('2026-11-25 · 5 contributions')).toBeInTheDocument();

    fireEvent.mouseLeave(gitTile);
    fireEvent.click(gitTile);
    expect(within(gitCard as HTMLElement).getByText('2026-11-25 · 5 contributions')).toBeInTheDocument();

    const writingTile = screen.getByRole('button', { name: '2026-11-24 · 1 post' });
    fireEvent.mouseEnter(writingTile);
    const writingCard = writingTile.closest('section');
    expect(writingCard).not.toBeNull();
    expect(within(writingCard as HTMLElement).getByText('2026-11-24 · 1 post')).toBeInTheDocument();

    const periodPicker = within(gitCard as HTMLElement).getByRole('complementary', {
      name: `${zhAbout.activity.git.eyebrow} period`,
    });
    fireEvent.click(within(periodPicker).getByRole('button', { name: '2026' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/internal/activity/github?scope=account&period=2026',
      );
    });
  });

  it('suppresses colliding partial leading month label when next month starts within two weeks', () => {
    const partialNovDays = [
      { date: '2025-11-26', count: 1 },
      { date: '2025-11-27', count: 0 },
      { date: '2025-11-28', count: 0 },
      { date: '2025-11-29', count: 0 },
      { date: '2025-11-30', count: 0 },
      { date: '2025-12-01', count: 2 },
      { date: '2025-12-02', count: 0 },
      { date: '2025-12-03', count: 0 },
    ];

    render(
      <AboutActivityFeature
        backHref="/zh/about"
        initialGitActivity={{
          status: 'available',
          data: {
            scope: 'account',
            period: 'all',
            range: { kind: 'rolling', from: '2025-11-26', to: '2025-12-03', year: 2025 },
            totalCount: 3,
            days: partialNovDays,
          },
        }}
        initialWritingActivity={initialWritingActivity}
        gitYears={[2026, 2025]}
      />,
    );

    const gitCard = screen
      .getByRole('button', { name: '2025-11-26 · 1 contribution' })
      .closest('section') as HTMLElement;
    expect(within(gitCard).queryByText('Nov')).not.toBeInTheDocument();
    expect(within(gitCard).getByText('Dec')).toBeInTheDocument();
  });
});
