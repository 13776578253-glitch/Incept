import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoadmapProject } from '@incept/roadmap/domain';
import type { AppLocale } from '@/i18n/config/locales';
import { createSiteNavigation } from '@/components/layouts/site-navigation';
import enNavigation from '@/messages/en/navigation.json';
import zhNavigation from '@/messages/zh/navigation.json';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listRoadmaps: vi.fn(),
  listBoard: vi.fn(),
  isOwner: vi.fn(),
  board: vi.fn<(...args: unknown[]) => null>(() => null),
  toolbar: vi.fn<(...args: unknown[]) => null>(() => null),
}));

vi.mock('@/server/roadmap/assembly', () => ({
  createRoadmapRepository: () => ({
    listProjects: mocks.listProjects,
    listRoadmaps: mocks.listRoadmaps,
    listBoard: mocks.listBoard,
  }),
  isRoadmapOwner: mocks.isOwner,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('@incept/roadmap/react', () => ({
  RoadmapBoard: mocks.board,
  RoadmapToolbar: mocks.toolbar,
  IconChevronDown: () => null,
  IconProjectTag: () => null,
}));

import RoadmapPage from '@/app/[locale]/roadmap/page';

const project: RoadmapProject = {
  key: 'project one',
  name: { en: 'Project One', zh: '项目一' },
  roadmapEnabled: true,
  atlasEnabled: true,
};
const roadmaps = [
  { key: 'project-roadmap', project, name: { en: 'Roadmap', zh: '路线图' }, columns: [] },
  { key: 'project-atlas', project, name: { en: 'Planning Board', zh: '规划图' }, columns: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProjects.mockResolvedValue([project]);
  mocks.listRoadmaps.mockResolvedValue(roadmaps);
  mocks.listBoard.mockImplementation(async (key: string) => ({
    roadmap: roadmaps.find((item) => item.key === key),
    entries: [],
  }));
  mocks.isOwner.mockResolvedValue(false);
});

afterEach(cleanup);

describe('standalone roadmap page', () => {
  it.each([
    ['en', 'roadmap', false],
    ['zh', 'roadmap', true],
    ['en', 'atlas', true],
    ['zh', 'atlas', false],
  ] as const)('keeps %s %s selection and owner controls at /roadmap', async (locale, surface, canEdit) => {
    mocks.isOwner.mockResolvedValue(canEdit);
    render(await RoadmapPage({
      params: Promise.resolve({ locale }),
      searchParams: Promise.resolve({ project: project.key, surface }),
    }));

    const key = surface === 'atlas' ? 'project-atlas' : 'project-roadmap';
    expect(mocks.listBoard).toHaveBeenCalledWith(key);
    expect(mocks.board.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      board: expect.objectContaining({ roadmap: expect.objectContaining({ key }) }),
      canEdit,
    }));
    expect(mocks.toolbar.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      currentProjectKey: project.key,
      activeSurface: surface,
      currentRoadmapKey: key,
      canEdit,
      hrefs: { [project.key]: `/${locale}/roadmap?project=project%20one&surface=${surface}` },
    }));
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/${locale}/roadmap?project=project%20one&surface=roadmap`,
      `/${locale}/roadmap?project=project%20one&surface=atlas`,
    ]);
    expect(links[surface === 'atlas' ? 1 : 0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      surface === 'atlas' ? roadmaps[1].name[locale] : 'page.title',
    );
  });

  it('keeps legacy board selection through rd at the standalone route', async () => {
    render(await RoadmapPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ project: project.key, rd: 'project-atlas' }),
    }));
    expect(mocks.listBoard).toHaveBeenCalledWith('project-atlas');
    expect(screen.getByRole('link', { name: 'Planning' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the disabled planning surface locked and falls back to roadmap', async () => {
    mocks.listProjects.mockResolvedValue([{ ...project, atlasEnabled: false }]);
    render(await RoadmapPage({
      params: Promise.resolve({ locale: 'zh' }),
      searchParams: Promise.resolve({ project: project.key, surface: 'atlas' }),
    }));
    expect(mocks.listBoard).toHaveBeenCalledWith('project-roadmap');
    expect(screen.getByRole('button', { name: /规划图/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: '路线图' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('primary navigation baseline', () => {
  it.each(['en', 'zh'] as const)('keeps public navigation free of owner-only pages for %s', (locale: AppLocale) => {
    const messages = locale === 'zh' ? zhNavigation : enNavigation;
    const translate = (key: string) => key.split('.').reduce<unknown>(
      (value, segment) => (value as Record<string, unknown>)[segment], messages,
    ) as string;
    const navigation = createSiteNavigation(locale, translate);
    expect(navigation.map(({ id, href, label }) => ({ id, href, label }))).toEqual(
      ['docs', 'roadmap', 'dashboard'].map((id) => ({
        id,
        href: `/${locale}/${id}`,
        label: messages.primary[id as keyof typeof messages.primary],
      })),
    );
    expect(navigation.find((item) => item.id === 'roadmap')?.groups).toBeUndefined();
  });
});
