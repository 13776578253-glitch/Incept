import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import {
  updateDocsCollectionMetadata,
  updateDocsDocumentMetadata,
} from '@incept/db/docs';
import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

type MetadataPatchBody = {
  targetType?: unknown;
  targetId?: unknown;
  locale?: unknown;
  title?: unknown;
  accessRole?: unknown;
  applyToArticles?: unknown;
};

const VALID_ROLES = new Set(['guest', 'pro', 'private']);
const VALID_LOCALES = new Set(['zh', 'en']);

export async function PATCH(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
  }

  const viewer = await getCurrentViewer();
  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Owner authentication required' }, { status: 401 });
  }

  let body: MetadataPatchBody;
  try {
    body = (await request.json()) as MetadataPatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { targetType, targetId, locale, title, accessRole, applyToArticles } = body;
  if (
    (targetType !== 'document' && targetType !== 'collection') ||
    typeof targetId !== 'number' ||
    !Number.isInteger(targetId) ||
    targetId <= 0 ||
    typeof locale !== 'string' ||
    !VALID_LOCALES.has(locale)
  ) {
    return NextResponse.json({ error: 'Invalid docs metadata payload' }, { status: 400 });
  }

  const hasTitle = title !== undefined;
  const hasAccessRole = accessRole !== undefined;
  if (!hasTitle && !hasAccessRole) {
    return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
  }

  let normalizedTitle: string | undefined;
  if (hasTitle) {
    if (typeof title !== 'string') {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }
    normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || normalizedTitle.length > 200) {
      return NextResponse.json({ error: 'Title must be 1 to 200 characters' }, { status: 400 });
    }
  }

  let normalizedRole: 'guest' | 'pro' | 'private' | undefined;
  if (hasAccessRole) {
    if (typeof accessRole !== 'string' || !VALID_ROLES.has(accessRole)) {
      return NextResponse.json({ error: 'Invalid access role' }, { status: 400 });
    }
    normalizedRole = accessRole as 'guest' | 'pro' | 'private';
  }

  if (applyToArticles !== undefined && typeof applyToArticles !== 'boolean') {
    return NextResponse.json({ error: 'Invalid applyToArticles flag' }, { status: 400 });
  }

  const updated =
    targetType === 'document'
      ? await updateDocsDocumentMetadata({
          documentId: targetId,
          locale: locale as 'zh' | 'en',
          title: normalizedTitle,
          accessRole: normalizedRole,
        })
      : await updateDocsCollectionMetadata({
          collectionId: targetId,
          locale: locale as 'zh' | 'en',
          title: normalizedTitle,
          accessRole: normalizedRole,
          applyToArticles: applyToArticles === true,
        });

  if (!updated) {
    return NextResponse.json({ error: 'Docs entry not found' }, { status: 404 });
  }

  revalidatePath('/zh/docs', 'layout');
  revalidatePath('/en/docs', 'layout');
  revalidatePath('/zh/settings');
  revalidatePath('/en/settings');

  return NextResponse.json({
    ok: true,
    entry: {
      ...updated,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
