import { dashboardImportPreviewPost } from '@incept/dashboard/next';
import { requireOwner } from '@/server/auth/guards';
import { withUploadSlot } from '@/server/media/upload-slot';
import { getRequestOrigin } from '@/server/auth/request-origin';
export const runtime = 'nodejs';
export async function POST(request: Request) { await requireOwner(); return withUploadSlot(() => dashboardImportPreviewPost(request, getRequestOrigin(request))); }
