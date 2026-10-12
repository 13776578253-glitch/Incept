import { NextResponse } from 'next/server';
import type { GitHubActivityScope } from '@/features/about/activity-data';
import { getActivityYears, getGitHubActivity } from '@/server/activity/github';
import { requireOwner } from '@/server/auth';

export const runtime = 'nodejs';

const scopes = new Set<GitHubActivityScope>(['account', 'repository', '1002bot']);

export async function GET(request: Request) {
  await requireOwner();

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const periodValue = searchParams.get('period');
  const period = periodValue === 'all' ? 'all' : Number(periodValue);

  if (
    !scopes.has((scope ?? '') as GitHubActivityScope) ||
    (period !== 'all' && !getActivityYears().includes(period as never))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(
    await getGitHubActivity({ scope: scope as GitHubActivityScope, period }),
  );
}
