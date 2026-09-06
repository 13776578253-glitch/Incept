import 'server-only';

import { readDocsImportDraft } from '@/features/docs/importer/draft-store';
import { toDocsImportPreviewModel } from '@/features/docs/importer/preview-mapper';

// 获取预览数据
export async function getDocsImportPreview(draftId: string) {
  const draft = readDocsImportDraft(draftId);

  if (!draft) {
    return null;
  }

  return toDocsImportPreviewModel(draft);
}
