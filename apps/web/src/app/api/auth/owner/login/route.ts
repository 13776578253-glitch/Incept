import { ownerPostAction } from '@/server/auth/owner-controller';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return ownerPostAction(request, 'login');
}
