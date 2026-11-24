import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhDocs from '../../../../messages/zh/docs.json';
import zhNavigation from '../../../../messages/zh/navigation.json';
import type { DocsHomePageModel } from '@/features/docs/shared/types';
import { DocsHomeFeature } from '../index';

vi.mock('next/link', () => ({
  default: (props: { href: string; children: ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function createPageModel({
  curatedIds = new Set(['doc-curated']),
}: {
  curatedIds?: Set<string>;
} = {}): DocsHomePageModel {
  return {
    intro: {
      eyebrow: 'Docs',
      title: 'Documentation',
      description: 'Notes and guides',
    },
    groups: [
      {
        id: '2026',
        label: '2026',
        entries: [
          {
            id: 'doc-curated',
            entryType: 'singleArticle',
            slug: 'design-patterns',
            title: '设计模式',
            summary: '精选架构文章',
            publishedAt: '2026-09-15T00:00:00.000Z',
            requiredRole: 'guest',
            isCurated: curatedIds.has('doc-curated'),
            isAccessible: true,
            href: '/docs/design-patterns',
          },
          {
            id: 'doc-rough',
            entryType: 'singleArticle',
            slug: 'test-draft',
            title: '测试正文',
            summary: '临时随手记',
            publishedAt: '2026-09-03T00:00:00.000Z',
            requiredRole: 'guest',
            isCurated: curatedIds.has('doc-rough'),
            isAccessible: true,
            href: '/docs/test-draft',
          },
        ],
      },
    ],
  };
}

function renderHome(page: DocsHomePageModel) {
  return render(
    <NextIntlClientProvider
      locale="zh"
      messages={{ docs: zhDocs, navigation: zhNavigation }}
    >
      <DocsHomeFeature page={page} />
    </NextIntlClientProvider>,
  );
}

describe('DocsHomeFeature curation filter toggle', () => {
  it('defaults to curated-only mode and hides non-curated items', () => {
    renderHome(createPageModel());

    expect(screen.getByText('设计模式')).toBeTruthy();
    expect(screen.queryByText('测试正文')).toBeNull();

    const toggle = screen.getByRole('button', { name: /当前仅展示精选文章/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows all entries when toggled off and persists preference in localStorage', () => {
    renderHome(createPageModel());

    const toggle = screen.getByRole('button', { name: /当前仅展示精选文章/ });
    fireEvent.click(toggle);

    expect(screen.getByText('设计模式')).toBeTruthy();
    expect(screen.getByText('测试正文')).toBeTruthy();
    expect(window.localStorage.getItem('incept-docs-home-curated')).toBe('0');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to showing all entries when whitelist is empty', () => {
    renderHome(createPageModel({ curatedIds: new Set() }));

    expect(screen.getByText('设计模式')).toBeTruthy();
    expect(screen.getByText('测试正文')).toBeTruthy();
  });
});
