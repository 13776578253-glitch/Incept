import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { setDocsHomeEntryCurated } from '@incept/db/docs';
import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

type CurationPatchBody = {
  entryType?: unknown;
  targetId?: unknown;
  isCurated?: unknown;
};

export async function PATCH(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const viewer = await getCurrentViewer();
  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Owner authentication required' }, { status: 401 });
  }

  let body: CurationPatchBody;
  try {
    body = (await request.json()) as CurationPatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { entryType, targetId, isCurated } = body;
  if (
    (entryType !== 'singleArticle' && entryType !== 'collection') ||
    typeof targetId !== 'number' ||
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    typeof isCurated !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Invalid curation payload' }, { status: 400 });
  }

  const updated = await setDocsHomeEntryCurated({
    entryType,
    targetId,
    isCurated,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Docs entry not found' }, { status: 404 });
  }

  revalidatePath('/zh/docs');
  revalidatePath('/en/docs');
  revalidatePath('/zh/settings');
  revalidatePath('/en/settings');

  return NextResponse.json({ ok: true, entry: updated });
}
