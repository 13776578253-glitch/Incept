import type {
  ActivityRange,
  GitHubActivityData,
  GitHubActivityPeriod,
  GitHubActivityScope,
} from '@/features/about/activity-data';
import {
  getActivityTotal,
  getShanghaiDate,
  normalizeActivityDays,
  toShanghaiDateTime,
} from './calendar';

type FetchImplementation = typeof fetch;

export type GitHubActivityConfig = {
  token: string;
  account: string;
  repository: string;
};

// GraphQL 响应结构 / 贡献日历
type GitHubGraphQlResponse = {
  data?: {
    viewer?: {
      login?: string;
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: Array<{
            contributionDays?: Array<{ date?: string; contributionCount?: number }>;
          }>;
        };
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type GitHubRepositoryResponse = {
  default_branch?: string;
};

type GitHubCommitResponse = Array<{
  commit?: {
    author?: { date?: string | null };
    committer?: { date?: string | null };
  };
}>;

function getHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`GitHub request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function toActivityData(
  scope: GitHubActivityScope,
  period: GitHubActivityPeriod,
  range: ActivityRange,
  countedDays: Array<{ date: string; count: number }>,
): GitHubActivityData {
  const days = normalizeActivityDays(range, countedDays);

  return {
    scope,
    period,
    range,
    totalCount: getActivityTotal(days),
    days,
  };
}

/**
 * 获取账户维度的活跃度数据
 * 使用 GitHub GraphQL API 查询 viewer.contributionsCollection
 *
 * @param config              GitHub 配置（token, account, repository）
 * @param period              统计周期
 * @param range               起止日期范围
 * @param fetchImplementation 可注入fetch 实现（测试）
 */
export async function fetchAccountActivity(
  config: GitHubActivityConfig,
  period: GitHubActivityPeriod,
  range: ActivityRange,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      ...getHeaders(config.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query ContributionCalendar($from: DateTime!, $to: DateTime!) {
          viewer {
            login
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar {
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        from: toShanghaiDateTime(range.from),
        to: toShanghaiDateTime(range.to, true),
      },
    }),
  });
  const payload = await readJson<GitHubGraphQlResponse>(response);

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GitHub GraphQL request failed.');
  }

  if (payload.data?.viewer?.login?.toLowerCase() !== config.account.toLowerCase()) {
    throw new Error('GitHub activity token does not match the configured account.');
  }

  const weeks = payload.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) {
    throw new Error('GitHub contribution calendar was missing.');
  }

  // 将 weeks 扁平化为 { date, count } 数组
  const countedDays = weeks.flatMap((week) =>
    (week.contributionDays ?? []).flatMap((day) =>
      typeof day.date === 'string' && typeof day.contributionCount === 'number'
        ? [{ date: day.date, count: day.contributionCount }]
        : [],
    ),
  );

  return toActivityData('account', period, range, countedDays);
}

/**
 * 获取仓库维度的活跃度数据 / 提交记录
 * 使用 GitHub REST API 分页查询仓库 commits，以天为单位计数
 */
export async function fetchRepositoryActivity(
  config: GitHubActivityConfig,
  period: GitHubActivityPeriod,
  range: ActivityRange,
  fetchImplementation: FetchImplementation = fetch,
) {
  const repositoryUrl = `https://api.github.com/repos/${encodeURIComponent(config.account)}/${encodeURIComponent(config.repository)}`;
  const repository = await readJson<GitHubRepositoryResponse>(
    await fetchImplementation(repositoryUrl, { headers: getHeaders(config.token) }),
  );

  if (!repository.default_branch) {
    throw new Error('GitHub repository default branch was missing.');
  }

  const countedDays: Array<{ date: string; count: number }> = [];
  for (let page = 1; ; page += 1) {
    const commitsUrl = new URL(`${repositoryUrl}/commits`);
    commitsUrl.searchParams.set('sha', repository.default_branch);
    commitsUrl.searchParams.set('since', toShanghaiDateTime(range.from));
    commitsUrl.searchParams.set('until', toShanghaiDateTime(range.to, true));
    commitsUrl.searchParams.set('per_page', '100');
    commitsUrl.searchParams.set('page', String(page));

    const commits = await readJson<GitHubCommitResponse>(
      await fetchImplementation(commitsUrl, { headers: getHeaders(config.token) }),
    );

    for (const commit of commits) {
      const timestamp = commit.commit?.author?.date ?? commit.commit?.committer?.date;
      if (timestamp) {
        countedDays.push({ date: getShanghaiDate(new Date(timestamp)), count: 1 });
      }
    }

    if (commits.length < 100) {
      break;
    }
  }

  return toActivityData('repository', period, range, countedDays);
}
