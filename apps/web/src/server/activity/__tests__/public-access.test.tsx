import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ article: vi.fn(), git: vi.fn(), writing: vi.fn(), owner: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/server/auth', () => ({ requireOwner: mocks.owner }));
vi.mock('@/server/docs/loaders', () => ({ getUnlistedDocsArticlePage: mocks.article }));
vi.mock('@/server/activity/github', () => ({ getActivityYears: () => [2026], getGitHubActivity: mocks.git }));
vi.mock('@/server/activity/writing', () => ({ getWritingActivity: mocks.writing }));

import AboutPage from '@/app/[locale]/about/page';
import ActivityPage from '@/app/[locale]/about/activity/page';
import { GET as gitGet } from '@/app/api/internal/activity/github/route';
import { GET as writingGet } from '@/app/api/internal/activity/writing/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockRejectedValue(new Error('Public reads must not require Owner'));
  mocks.article.mockResolvedValue({ sections: [{ id: 'intro', title: 'Introduction', blocks: [] }] });
  mocks.git.mockResolvedValue({ status: 'available', data: { days: [], totalCount: 0 } });
  mocks.writing.mockResolvedValue({ days: [], articleCount: 0, writingUnits: 0 });
});

it.each(['zh', 'en'] as const)('reads the %s About body with Guest permissions and keeps its activity link', async locale => {
  const page = await AboutPage({ params: Promise.resolve({ locale }) });
  expect(mocks.article).toHaveBeenCalledWith({ locale, documentKey: 'about', viewerRole: 'guest' });
  expect(page.props.sections[0].title).toBe('Introduction');
  expect(page.props.activityHref).toBe(`/${locale}/about/activity`);
  expect(mocks.owner).not.toHaveBeenCalled();
});

it('loads the activity page without establishing an Owner session', async () => {
  const page = await ActivityPage({ params: Promise.resolve({ locale: 'zh' }) });
  expect(page.props.backHref).toBe('/zh/about');
  expect(mocks.git).toHaveBeenCalledWith({ scope: 'account', period: 'all' });
  expect(mocks.writing).toHaveBeenCalledWith({ period: 'all' });
  expect(mocks.owner).not.toHaveBeenCalled();
});

it.each(['account', 'repository', '1002bot'])('serves anonymous %s GitHub summary requests', async scope => {
  const result = await gitGet(new Request(`http://localhost/api/internal/activity/github?scope=${scope}&period=2026`));
  expect(result.status).toBe(200);
  expect(mocks.git).toHaveBeenCalledWith({ scope, period: 2026 });
  expect(mocks.owner).not.toHaveBeenCalled();
});

it('rejects unsupported GitHub parameters before collecting data', async () => {
  for (const query of ['scope=invalid&period=all', 'scope=account&period=1999', 'scope=account&period=invalid']) {
    expect((await gitGet(new Request(`http://localhost/api/internal/activity/github?${query}`))).status).toBe(404);
  }
  expect(mocks.git).not.toHaveBeenCalled();
});

it('serves anonymous writing summaries and rejects unsupported years', async () => {
  expect((await writingGet(new Request('http://localhost/api/internal/activity/writing?period=all'))).status).toBe(200);
  expect((await writingGet(new Request('http://localhost/api/internal/activity/writing?period=1999'))).status).toBe(404);
  expect(mocks.writing).toHaveBeenCalledTimes(1);
  expect(mocks.writing).toHaveBeenCalledWith({ period: 'all' });
  expect(mocks.owner).not.toHaveBeenCalled();
});
