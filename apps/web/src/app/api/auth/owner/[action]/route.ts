import { ownerPostAction } from '@/server/auth/owner-controller';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return ownerPostAction(request, (await params).action);
}
