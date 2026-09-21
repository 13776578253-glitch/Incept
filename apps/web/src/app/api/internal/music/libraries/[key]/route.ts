import { deleteMusicLibrary, updateMusicLibrary, type MusicLibraryPatch } from '@incept/db/music';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

export const runtime = 'nodejs';

function parsePatch(body: unknown): MusicLibraryPatch | null {
  if (typeof body !== 'object' || body === null) return null;

  const record = body as Record<string, unknown>;
  const patch: MusicLibraryPatch = {};

  if (record.title !== undefined) {
    if (typeof record.title !== 'string') return null;
    patch.title = record.title;
  }

  if (record.position !== undefined) {
    if (typeof record.position !== 'number') return null;
    patch.position = record.position;
  }

  if (record.isActive !== undefined) {
    if (typeof record.isActive !== 'boolean') return null;
    patch.isActive = record.isActive;
  }

  if (record.moveMembersTo !== undefined) {
    if (typeof record.moveMembersTo !== 'string') return null;
    patch.moveMembersTo = record.moveMembersTo;
  }

  return patch;
}

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
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

  const { key } = await context.params;

  try {
    const library = await updateMusicLibrary({ key, patch });

    return NextResponse.json({ library });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The library could not be updated.' },
      { status: 400 },
    );
  }
}

// 永久删除：只删没有成员的曲库，也不许删掉最后一个启用库；规则在 db 层，这里透传
export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { key } = await context.params;

  try {
    const deleted = await deleteMusicLibrary({ key });

    return NextResponse.json({ key: deleted.key });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The library could not be deleted.' },
      { status: 400 },
    );
  }
}
