import { NextResponse } from 'next/server';
import { importDocsArticleDraft, importDocsCollectionDirectory } from '@incept/db/docs';
import { deleteDocsImportDraft, readDocsImportDraft } from '@/features/docs/importer/draft-store';
import { getCurrentViewer, hasSameOrigin } from '@/server/auth';

// 处理导入预览的确认请求，将草稿文章正式导入文档数据库
export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      locale: string;
      draftId: string;
    }>;
  },
) {

  // 验证请求来源
  if (!hasSameOrigin(_request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { draftId } = await context.params;
  const draft = readDocsImportDraft(draftId);

  if (!draft) {
    return NextResponse.json(
      {
        error: 'Draft not found.',
      },
      { status: 404 },
    );
  }

  const errorCount = draft.issues.filter((issue) => issue.level === 'error').length;

  if (errorCount > 0) {
    return NextResponse.json(
      {
        error: 'Draft contains validation errors and cannot be imported.',
      },
      { status: 400 },
    );
  }

  // 根据草稿类型执行不同的导入操作
  const result = draft.draftType === 'collectionDirectory'
    ? await importDocsCollectionDirectory({
        sources: draft.collectionSources ?? [draft.source],
        nodes: draft.collectionNodes ?? [],
        replace: draft.replace,
      })
    : await importDocsArticleDraft({
        source: draft.source,
        replace: draft.replace,
      });

  deleteDocsImportDraft(draftId);

  const targetLocale = draft.source.meta.locale;
  const isNote = draft.source.meta.kind === 'note';
  const redirectPath = isNote
    ? `/${targetLocale}/notes/${draft.source.meta.slug}?imported=1`
    : draft.source.meta.routeType === 'collectionArticle'
      ? `/${targetLocale}/docs/series/${draft.source.meta.collectionSlug}/${draft.source.meta.slug}?imported=1`
      : `/${targetLocale}/docs/${draft.source.meta.slug}?imported=1`;

  return NextResponse.redirect(new URL(redirectPath, _request.url), {
      status: 303,
    headers: {
      'x-docs-import-document-id': String(
        'documentId' in result ? result.documentId : result.documentIds[0],
      ),
    },
  });
}
