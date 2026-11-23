import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import docsMessages from '@/messages/zh/docs.json';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { DocsArticleFeature } from '../docs-article-feature';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/zh/docs/series/design-patterns/design-patterns-overview',
  useSearchParams: () => new URLSearchParams(),
}));

function buildArticlePage(overrides: Partial<DocsArticlePageModel> = {}): DocsArticlePageModel {
  return {
    id: 'article-1',
    slug: 'design-patterns-overview',
    routeType: 'collectionArticle',
    collectionSlug: 'design-patterns',
    articleSlug: 'design-patterns-overview',
    layoutMode: 'sidebar',
    locale: 'zh',
    eyebrow: 'DESIGN PATTERN',
    title: '设计模式(一)',
    description: '从模式的起源说起，把 GoF 23、GRASP 9 与企业架构模式放到同一张地图上。',
    lastEditedAt: '2026-09-15T00:00:00.000Z',
    readingStats: {
      chineseCharacterCount: 2400,
      wordCount: 120,
      writingUnits: 2520,
      estimatedMinutes: 8,
    },
    outlineLabel: '本页目录',
    sidebarGroups: [
      {
        id: 'group-patterns',
        label: '设计模式系列',
        defaultOpen: true,
        items: [
          {
            id: 'item-1',
            label: '设计模式(一)',
            href: '/docs/series/design-patterns/design-patterns-overview',
            active: true,
          },
          {
            id: 'item-2',
            label: '设计模式(二)',
            href: '/docs/series/design-patterns/creational-patterns',
            active: false,
          },
        ],
      },
    ],
    outline: [
      { id: 'sec-origin', label: '模式的起源', level: 1 },
      { id: 'sec-map', label: '模式地图', level: 1 },
    ],
    sections: [
      {
        id: 'sec-origin',
        title: '模式的起源',
        blocks: [
          { id: 'p-1', type: 'paragraph', text: '一段用于验证排版与目录锚点的中文段落' },
        ],
      },
      {
        id: 'sec-map',
        title: '模式地图',
        blocks: [
          { id: 'p-2', type: 'paragraph', text: '另一段正文用于验证大纲跳转与滚动同步' },
        ],
      },
    ],
    ...overrides,
  };
}

function renderArticle(
  page: DocsArticlePageModel,
  backToListHref = '/zh/docs',
) {
  return render(
    <NextIntlClientProvider locale="zh" messages={{ docs: docsMessages }}>
      <DocsArticleFeature page={page} backToListHref={backToListHref} />
    </NextIntlClientProvider>,
  );
}

describe('DocsArticleFeature', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('renders collection sidebar aria-current, edge-docked chapters tab, and closes popover via Escape and navigation', async () => {
    const user = userEvent.setup();
    renderArticle(buildArticlePage());

    const sidebarNav = screen.getByRole('navigation', { name: 'Docs sidebar' });
    const activeChapter = within(sidebarNav).getByRole('link', { name: '设计模式(一)' });
    expect(activeChapter).toHaveAttribute('aria-current', 'page');

    const chaptersButton = screen.getByRole('button', { name: '合集目录' });
    expect(chaptersButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(chaptersButton);
    const chaptersDialog = screen.getByRole('dialog', { name: '合集目录' });
    expect(chaptersDialog).toBeInTheDocument();
    expect(chaptersButton).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(chaptersButton);
    const secondChapter = within(screen.getByRole('dialog', { name: '合集目录' }))
      .getByRole('link', { name: '设计模式(二)' });
    await user.click(secondChapter);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('supports toggling and closing the edge-docked outline popover via outline click and close button', async () => {
    const user = userEvent.setup();
    renderArticle(buildArticlePage());

    const outlineTrigger = screen.getByRole('button', { name: '本页目录' });
    await user.click(outlineTrigger);

    const outlineDialog = screen.getByRole('dialog', { name: '本页目录' });
    const outlineLink = within(outlineDialog).getByRole('link', { name: '模式地图' });
    expect(outlineLink).toHaveAttribute('href', '#sec-map');

    await user.click(outlineLink);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(outlineTrigger);
    expect(screen.getByRole('dialog', { name: '本页目录' })).toBeInTheDocument();

    await user.click(outlineTrigger);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(outlineTrigger);
    await user.click(screen.getByRole('button', { name: '关闭目录' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders contentOnly layout with only outline button when present and omits edge dock when outline is empty', () => {
    const withOutline = renderArticle(
      buildArticlePage({
        routeType: 'singleArticle',
        layoutMode: 'contentOnly',
        sidebarGroups: [],
      }),
    );

    expect(withOutline.container.querySelector('[data-layout-mode="contentOnly"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '合集目录' })).toBeNull();
    expect(screen.getByRole('button', { name: '本页目录' })).toBeInTheDocument();

    withOutline.unmount();

    const { container } = renderArticle(
      buildArticlePage({
        routeType: 'singleArticle',
        layoutMode: 'contentOnly',
        sidebarGroups: [],
        outline: [],
      }),
    );

    const shell = container.querySelector('[data-layout-mode="contentOnly"]');
    expect(shell).not.toBeNull();
    expect(screen.queryByRole('button', { name: '合集目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '本页目录' })).toBeNull();
  });
});
