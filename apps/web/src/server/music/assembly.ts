import path from 'node:path';

import { resolveMusicContentRoot } from '@incept/music/adapters';
import type { AuthorizeOwner, MusicPaths } from '@incept/music/ports';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import { findRepoRoot } from '@/features/docs/importer/paths';

// Web 装配：路径与门禁的宿主实现（决策 5/6）；包只认 ports，不感知会话模型与仓库布局
export function webMusicMirrorDirectory(): string {
  return path.join(findRepoRoot(), 'apps', 'web', 'public', '_music-media');
}

export async function resolveWebMusicPaths(): Promise<MusicPaths> {
  return {
    contentRoot: await resolveMusicContentRoot(process.env.MUSIC_CONTENT_ROOT),
    mirrorDirectory: webMusicMirrorDirectory(),
  };
}

export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
  hasSameOrigin(request) && (await getCurrentViewer()).role === 'owner';
