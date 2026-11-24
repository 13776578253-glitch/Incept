import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhDocs from '../../../../messages/zh/docs.json';
import zhNavigation from '../../../../messages/zh/navigation.json';
import type { DocsHomeCurationEntryModel } from '../types';
import { DocsHomeCurationPanel } from '../components/docs-home-curation-panel';

const sampleEntries: DocsHomeCurationEntryModel[] = [
  {
    entryType: 'collection',
    targetId: 10,
    title: '设计模式合集',
    slug: 'design-patterns',
    locales: ['zh'],
    accessRole: 'guest',
    isCurated: true,
    publishedAt: '2026-09-15T00:00:00.000Z',
  },
  {
    entryType: 'singleArticle',
    targetId: 22,
    title: '测试正文',
    slug: 'test-draft',
    locales: ['zh'],
    accessRole: 'private',
    isCurated: false,
    publishedAt: '2026-09-03T00:00:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPanel(entries = sampleEntries) {
  return render(
    <NextIntlClientProvider
      locale="zh"
      messages={{ docs: zhDocs, navigation: zhNavigation }}
    >
      <DocsHomeCurationPanel initialEntries={entries} />
    </NextIntlClientProvider>,
  );
}

describe('DocsHomeCurationPanel', () => {
  it('renders standalone and collection rows and toggles whitelist optimistically', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    expect(screen.getByText('已选 1 / 2')).toBeTruthy();
    const articleSwitch = screen.getByRole('switch', { name: '测试正文' });
    expect(articleSwitch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(articleSwitch);

    expect(articleSwitch.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('已选 2 / 2')).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/internal/docs/curation',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            entryType: 'singleArticle',
            targetId: 22,
            isCurated: true,
          }),
        }),
      );
    });
  });

  it('reverts toggle state and shows error alert when PATCH fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'failed' }), { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    const collectionSwitch = screen.getByRole('switch', { name: '设计模式合集' });
    expect(collectionSwitch.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(collectionSwitch);

    await waitFor(() => {
      expect(collectionSwitch.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('alert').textContent).toContain('白名单状态更新失败');
    });
  });

  it('paginates long lists and resets page on search filtering', () => {
    const manyEntries: DocsHomeCurationEntryModel[] = Array.from({ length: 8 }, (_, index) => ({
      entryType: 'singleArticle',
      targetId: index + 1,
      title: `Article ${index + 1}`,
      slug: `article-${index + 1}`,
      locales: ['zh'],
      accessRole: 'guest',
      isCurated: index < 2,
      publishedAt: '2026-09-15T00:00:00.000Z',
    }));

    renderPanel(manyEntries);

    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Article 1')).toBeTruthy();
    expect(screen.queryByText('Article 7')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByText('Article 7')).toBeTruthy();
    expect(screen.getByText('Article 8')).toBeTruthy();
    expect(screen.queryByText('Article 1')).toBeNull();

    const searchInput = screen.getByRole('searchbox', { name: '搜索标题或 slug' });
    fireEvent.change(searchInput, { target: { value: 'Article 1' } });

    expect(screen.getByText('Article 1')).toBeTruthy();
    expect(screen.queryByText('2 / 2')).toBeNull();
  });
});
