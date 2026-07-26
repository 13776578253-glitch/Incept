import 'server-only';

import { unstable_cache } from 'next/cache';
import type {
  GitHubActivityResult,
  GitHubActivityPeriod,
  GitHubActivityScope,
} from '@/features/about/activity-data';
import { createActivityRange, getAvailableActivityYears } from './calendar';
import {
  fetchAccountActivity,
  fetchRepositoryActivity,
  type GitHubActivityConfig,
} from './github-api';

// 缓存 GitHub 活动数据 / 6h
const CACHE_REVALIDATE_SECONDS = 6 * 60 * 60;

function getGitHubActivityConfig(): GitHubActivityConfig | null {
  const token = process.env.GITHUB_ACTIVITY_TOKEN?.trim();
  const account = process.env.GITHUB_ACTIVITY_ACCOUNT?.trim();
  const repository = process.env.GITHUB_ACTIVITY_REPOSITORY?.trim();

  if (!token || !account || !repository) {
    return null;
  }

  return { token, account, repository };
}

const getCachedGitHubActivity = unstable_cache(
  async (scope: GitHubActivityScope, period: GitHubActivityPeriod) => {
    const config = getGitHubActivityConfig();
    if (!config) {
      throw new Error('GitHub activity is not configured.');
    }

    const years = getActivityYears();
    const range = period === 'all'
      ? createActivityRange(years[0])
      : createActivityRange(period, new Date(), 'calendar');
    return scope === 'account'
      ? fetchAccountActivity(config, period, range)
      : fetchRepositoryActivity(config, period, range);
  },
  ['github-activity-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);

export function getActivityYears() {
  return getAvailableActivityYears();
}

export async function getGitHubActivity({
  scope,
  period,
}: {
  scope: GitHubActivityScope;
  period: GitHubActivityPeriod;
}): Promise<GitHubActivityResult> {
  if (period !== 'all' && !getActivityYears().includes(period as ReturnType<typeof getActivityYears>[number])) {
    return { status: 'unavailable' };
  }

  if (!getGitHubActivityConfig()) {
    return { status: 'unavailable' };
  }

  try {
    return { status: 'available', data: await getCachedGitHubActivity(scope, period) };
  } catch {
    return { status: 'unavailable' };
  }
}
