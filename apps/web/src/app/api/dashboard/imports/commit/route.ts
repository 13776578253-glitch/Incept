import { dashboardImportCommitPost } from '@incept/dashboard/next';
import { requireOwner } from '@/server/auth/guards';
import { getRequestOrigin } from '@/server/auth/request-origin';
export const runtime = 'nodejs';
export async function POST(request: Request) { await requireOwner(); return dashboardImportCommitPost(request, getRequestOrigin(request)); }
