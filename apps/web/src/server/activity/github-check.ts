import assert from 'node:assert/strict';
import { createActivityRange, getShanghaiDate } from './calendar';
import { fetchAccountActivity, fetchRepositoryActivity } from './github-api';

const config = {
  token: 'test-token',
  account: 'example',
  repository: 'repository',
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function runGitHubActivityChecks() {
  assert.equal(
    getShanghaiDate(new Date('2026-07-01T16:30:00.000Z')),
    '2026-07-02',
    'UTC timestamps should be grouped by their Shanghai date.',
  );

  const currentRange = createActivityRange(2026, new Date('2026-07-26T12:00:00.000Z'));
  assert.deepEqual(currentRange, {
    year: 2026,
    kind: 'rolling',
    from: '2025-07-28',
    to: '2026-07-26',
  });
  assert.deepEqual(createActivityRange(2025, new Date('2026-07-26T12:00:00.000Z')), {
    year: 2025,
    kind: 'calendar',
    from: '2025-01-01',
    to: '2025-12-31',
  });

  const accountRange = { year: 2026, kind: 'rolling' as const, from: '2026-07-01', to: '2026-07-03' };
  const accountActivity = await fetchAccountActivity(
    config,
    'all',
    accountRange,
    async () =>
      jsonResponse({
        data: {
          viewer: {
            login: 'example',
            contributionsCollection: {
              contributionCalendar: {
                weeks: [
                  {
                    contributionDays: [
                      { date: '2026-07-01', contributionCount: 2 },
                      { date: '2026-07-03', contributionCount: 4 },
                    ],
                  },
                ],
              },
            },
          },
        },
      }),
  );
  assert.deepEqual(accountActivity.days, [
    { date: '2026-07-01', count: 2 },
    { date: '2026-07-02', count: 0 },
    { date: '2026-07-03', count: 4 },
  ]);
  assert.equal(accountActivity.totalCount, 6);

  const repositoryActivity = await fetchRepositoryActivity(
    config,
    2026,
    accountRange,
    async (input) => {
      const url = String(input);
      if (url.endsWith('/repos/example/repository')) {
        return jsonResponse({ default_branch: 'main' });
      }

      return jsonResponse([
        { commit: { author: { date: '2026-06-30T16:30:00.000Z' } } },
        { commit: { committer: { date: '2026-07-02T16:30:00.000Z' } } },
      ]);
    },
  );
  assert.deepEqual(repositoryActivity.days, [
    { date: '2026-07-01', count: 1 },
    { date: '2026-07-02', count: 0 },
    { date: '2026-07-03', count: 1 },
  ]);
  assert.equal(repositoryActivity.totalCount, 2);
}
