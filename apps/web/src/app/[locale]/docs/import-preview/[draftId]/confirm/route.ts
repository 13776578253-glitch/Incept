import { NextResponse } from 'next/server';
import { importDocsArticleDraft } from '@incept/db/docs';
import { deleteDocsImportDraft, readDocsImportDraft } from '@/features/docs/importer/draft-store';

// TODO: 需要添加权限验证，确保只有管理员或具有相应权限的用户才能执行导入操作

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

  const result = await importDocsArticleDraft({
    source: draft.source,
    replace: draft.replace,
  });

  deleteDocsImportDraft(draftId);

  const targetLocale = draft.source.meta.locale;
  const redirectPath =
    draft.source.meta.routeType === 'collectionArticle'
      ? `/${targetLocale}/docs/series/${draft.source.meta.collectionSlug}/${draft.source.meta.slug}?imported=1`
      : `/${targetLocale}/docs/${draft.source.meta.slug}?imported=1`;

  return NextResponse.redirect(new URL(redirectPath, _request.url), {
    status: 303,
    headers: {
      'x-docs-import-document-id': String(result.documentId),
    },
  });
}
