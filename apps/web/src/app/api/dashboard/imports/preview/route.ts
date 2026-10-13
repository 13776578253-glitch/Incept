import { dashboardImportPreviewPost } from '@incept/dashboard/next';
import { requireOwner } from '@/server/auth/guards';
export const runtime = 'nodejs';
export async function POST(request: Request) { await requireOwner(); return dashboardImportPreviewPost(request); }
