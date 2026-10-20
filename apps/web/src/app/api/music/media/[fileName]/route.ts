import { prisma } from '@incept/db';
import { webMusicMirrorDirectory } from '@/server/music/assembly';
import { isMediaFileName, mediaFileResponse } from '@/server/media/file-response';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  if (!isMediaFileName(fileName) || !await prisma.musicTrack.findFirst({
    where: { audioUrl: `/_music-media/${fileName}`, isActive: true }, select: { id: true },
  })) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return mediaFileResponse(request, webMusicMirrorDirectory(), fileName);
}
export const HEAD = GET;
