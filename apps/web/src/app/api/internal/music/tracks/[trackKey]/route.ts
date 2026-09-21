import { deleteMusicTrack, updateMusicTrack, type MusicTrackPatch } from '@incept/db/music';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import { removeMusicMediaByUrl } from '@/server/music/media-store';

export const runtime = 'nodejs';

function parsePatch(body: unknown): MusicTrackPatch | null {
  if (typeof body !== 'object' || body === null) return null;

  const record = body as Record<string, unknown>;
  const patch: MusicTrackPatch = {};

  if (record.title !== undefined) {
    if (typeof record.title !== 'string') return null;
    patch.title = record.title;
  }

  if (record.artist !== undefined) {
    if (record.artist !== null && typeof record.artist !== 'string') return null;
    patch.artist = record.artist;
  }

  if (record.publishedAt !== undefined) {
    if (record.publishedAt !== null && typeof record.publishedAt !== 'string') return null;

    if (record.publishedAt === null || record.publishedAt === '') {
      patch.publishedAt = null;
    } else {
      const parsed = new Date(record.publishedAt);

      if (Number.isNaN(parsed.getTime())) return null;

      patch.publishedAt = parsed;
    }
  }

  if (record.position !== undefined) {
    if (typeof record.position !== 'number') return null;
    patch.position = record.position;
  }

  if (record.isActive !== undefined) {
    if (typeof record.isActive !== 'boolean') return null;
    patch.isActive = record.isActive;
  }

  if (record.libraries !== undefined) {
    if (!Array.isArray(record.libraries) || record.libraries.some((key) => typeof key !== 'string')) {
      return null;
    }

    patch.libraryKeys = record.libraries as string[];
  }

  return patch;
}

export async function PATCH(request: Request, context: { params: Promise<{ trackKey: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const patch = parsePatch(body);

  if (patch === null || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { trackKey } = await context.params;

  try {
    const track = await updateMusicTrack({ trackKey, patch });

    return NextResponse.json({ track });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The track could not be updated.' },
      { status: 400 },
    );
  }
}

// 永久删除：行、成员关系与（没有别的行再引用的）镜像文件一起消失，与"停用"是两条路。
// 删除是不可撤销的，所以只由右键菜单里的二次确认触发。
export async function DELETE(request: Request, context: { params: Promise<{ trackKey: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { trackKey } = await context.params;

  try {
    const deleted = await deleteMusicTrack({ trackKey });
    const mediaRemoved = deleted.mediaUrl !== null && (await removeMusicMediaByUrl(deleted.mediaUrl));

    return NextResponse.json({ trackKey: deleted.trackKey, mediaRemoved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The track could not be deleted.' },
      { status: 400 },
    );
  }
}
