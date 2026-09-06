import 'server-only';

import type { CurrentViewer } from '@/server/auth/viewer';
import type { DocsAccessRole } from '@/features/docs/shared/types';

// 访问者信息 转换为 文档访问角色
export function toDocsViewerAccessRole(viewer: CurrentViewer): DocsAccessRole {
  return viewer.role === 'owner' ? 'private' : viewer.role;
}
