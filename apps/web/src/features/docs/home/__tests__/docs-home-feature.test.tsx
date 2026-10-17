import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsHomeFeature } from '../index';
import type { DocsHomePageModel } from '@/features/docs/shared/types';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const messages: Record<string, string> = {
      'docs.home.eyebrow': 'Docs',
      'docs.home.title': 'Technical Documentation',
      'docs.home.description': 'Guides, architecture references, and topic collections across the project.',
      'docs.home.stats.total': 'Total Documents',
      'docs.home.stats.totalDesc': 'Published technical entries',
      'docs.home.stats.collections': 'Topic Collections',
      'docs.home.stats.collectionsDesc': 'Structured series & guides',
      'docs.home.stats.standalone': 'Standalone Guides',
      'docs.home.stats.standaloneDesc': 'Focused technical notes',
      'docs.home.stats.recent': 'Updated in 30d',
      'docs.home.stats.recentDesc': 'Recently maintained records',
      'docs.home.filter.all': 'All',
      'docs.home.filter.collections': 'Collections',
      'docs.home.filter.standalone': 'Guides',
      'docs.home.filter.searchPlaceholder': 'Search articles, topics or tags…',
      'docs.home.filter.empty': 'No documents match the current filter.',
      'docs.home.filter.clearSearch': 'Clear search',
      'docs.home.filter.viewGrid': 'Grid view',
      'docs.home.filter.viewList': 'List view',
      'docs.home.filter.readAction': 'Read',
      'docs.home.filter.viewSeriesAction': 'View series',
      'docs.roles.guest': 'guest',
      'docs.roles.pro': 'Temporary access',
      'docs.roles.private': 'Private',
      'docs.groups.entries': `${values?.count ?? 0} entries`,
    };
    return messages[fullKey] ?? messages[key] ?? key;
  },
}));

const mockPage: DocsHomePageModel = {
  intro: {
    eyebrow: 'Docs',
    title: 'Technical Documentation',
    description: 'Guides, architecture references, and topic collections.',
  },
  stats: {
    totalArticles: 12,
    collections: 3,
    standalone: 9,
    recentlyUpdated: 4,
  },
  groups: [
    {
      id: '2026',
      label: '2026',
      entries: [
        {
          id: 'entry-1',
          entryType: 'collection',
          slug: 'series-arch',
          collectionSlug: 'series-arch',
          firstArticleSlug: 'intro',
          title: 'System Architecture Blueprint',
          summary: 'Comprehensive overview of service boundaries and schemas.',
          publishedAt: '2026-03-15T00:00:00.000Z',
          requiredRole: 'guest',
          eyebrow: 'Architecture',
          isAccessible: true,
          href: '/docs/series/series-arch/intro',
        },
        {
          id: 'entry-2',
          entryType: 'singleArticle',
          slug: 'database-migration',
          title: 'Database Migration Guide',
          summary: 'Zero downtime schema migrations with Prisma.',
          publishedAt: '2026-02-10T00:00:00.000Z',
          requiredRole: 'guest',
          eyebrow: 'Database',
          isAccessible: true,
          href: '/docs/database-migration',
        },
      ],
    },
  ],
};

describe('DocsHomeFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header, KPI stats, and documents in grid mode', () => {
    render(<DocsHomeFeature page={mockPage} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Technical Documentation' })).toBeInTheDocument();
    expect(screen.getByText('Total Documents')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('System Architecture Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Database Migration Guide')).toBeInTheDocument();
  });

  it('filters documents by category capsule tabs', async () => {
    const user = userEvent.setup();
    render(<DocsHomeFeature page={mockPage} />);

    // Click "Collections" tab
    await user.click(screen.getByRole('tab', { name: 'Collections' }));
    expect(screen.getByText('System Architecture Blueprint')).toBeInTheDocument();
    expect(screen.queryByText('Database Migration Guide')).not.toBeInTheDocument();

    // Click "Guides" tab
    await user.click(screen.getByRole('tab', { name: 'Guides' }));
    expect(screen.queryByText('System Architecture Blueprint')).not.toBeInTheDocument();
    expect(screen.getByText('Database Migration Guide')).toBeInTheDocument();

    // Click "All" tab
    await user.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByText('System Architecture Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Database Migration Guide')).toBeInTheDocument();
  });

  it('filters documents by real-time search and handles empty results', async () => {
    const user = userEvent.setup();
    render(<DocsHomeFeature page={mockPage} />);

    const searchInput = screen.getByRole('searchbox', { name: 'Search articles, topics or tags…' });

    // Type query matching only the migration guide
    await user.type(searchInput, 'migration');
    expect(await screen.findByText('Database Migration Guide')).toBeInTheDocument();
    expect(screen.queryByText('System Architecture Blueprint')).not.toBeInTheDocument();

    // Type query matching nothing
    await user.type(searchInput, 'nonexistentquery');
    expect(await screen.findByText('No documents match the current filter.')).toBeInTheDocument();

    // Click clear search
    const clearButtons = screen.getAllByRole('button', { name: 'Clear search' });
    await user.click(clearButtons[0]);
    expect(await screen.findByText('System Architecture Blueprint')).toBeInTheDocument();
    expect(await screen.findByText('Database Migration Guide')).toBeInTheDocument();
  });
});
