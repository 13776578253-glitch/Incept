import path from 'node:path';
import { getDocsMediaDirectory, findRepoRoot } from '@/features/docs/importer/paths';
import { getCurrentViewer } from '@/server/auth';
import { toDocsViewerAccessRole } from '@/server/docs/viewer';
import { canReadDocsMedia } from '@/server/docs/media-access';
import { isMediaFileName, mediaFileResponse } from '@/server/media/file-response';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const viewer = await getCurrentViewer();
  if (!isMediaFileName(fileName) || (viewer.role !== 'owner' && !await canReadDocsMedia(`/_docs-media/${fileName}`, toDocsViewerAccessRole(viewer)))) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = await mediaFileResponse(request, getDocsMediaDirectory(), fileName);
  if (response.status !== 404 || process.env.INCEPT_DOCS_MEDIA_DIR) return response;
  return mediaFileResponse(request, path.join(findRepoRoot(), 'apps/web/public/_docs-media'), fileName);
}
export const HEAD = GET;
