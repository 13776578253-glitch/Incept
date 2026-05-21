import 'server-only';

import { readDocsImportDraft } from '@/features/docs/importer/draft-store';
import { toDocsImportPreviewModel } from '@/features/docs/importer/preview-mapper';

// 获取导入草稿的预览数据，用于在前端展示草稿的验证结果和内容预览
export async function getDocsImportPreview(draftId: string) {
  const draft = readDocsImportDraft(draftId);

  if (!draft) {
    return null;
  }

  return toDocsImportPreviewModel(draft);
}
