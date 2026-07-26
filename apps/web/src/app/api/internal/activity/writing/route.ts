import { NextResponse } from 'next/server';
import { getActivityYears } from '@/server/activity/github';
import { getWritingActivity } from '@/server/activity/writing';
import { requireOwner } from '@/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requireOwner();

  const periodValue = new URL(request.url).searchParams.get('period');
  const period = periodValue === 'all' ? 'all' : Number(periodValue);
  if (period !== 'all' && !getActivityYears().includes(period as never)) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(await getWritingActivity({ period }));
}
