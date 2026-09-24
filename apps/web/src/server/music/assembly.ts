import {
  createMusicCatalogRoute,
  createMusicLibrariesRoute,
  createMusicLibraryItemRoute,
  createMusicTrackItemRoute,
  createMusicTracksRoute,
} from '@incept/music/next';
import { createPrismaMusicRepository } from '@incept/music/adapters';
import type { AuthorizeOwner } from '@incept/music/ports';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import { findRepoRoot } from '@/features/docs/importer/paths';
import { musicMirrorDirectory as musicMirrorDirectoryOf } from '../../../../../scripts/music-paths.mjs';

// Web 装配：路径与门禁的宿主实现（决策 5/6）；包只认 ports，不感知会话模型与仓库布局
export function webMusicMirrorDirectory(): string {
  return musicMirrorDirectoryOf(findRepoRoot());
}

export const authorizeOwner: AuthorizeOwner<Request> = async (request) =>
  hasSameOrigin(request) && (await getCurrentViewer()).role === 'owner';

// 路由装配：5 个 route handler 工厂的宿主绑定（决策 4/6）；app/api 下的 stub 只 re-export 这些具名 handler
const musicRouteDeps = {
  authorizeOwner,
  repository: createPrismaMusicRepository(),
  paths: { mirrorDirectory: webMusicMirrorDirectory() },
};

const musicCatalogRoute = createMusicCatalogRoute(musicRouteDeps);
const musicTracksRoute = createMusicTracksRoute(musicRouteDeps);
const musicTrackItemRoute = createMusicTrackItemRoute(musicRouteDeps);
const musicLibrariesRoute = createMusicLibrariesRoute(musicRouteDeps);
const musicLibraryItemRoute = createMusicLibraryItemRoute(musicRouteDeps);

export const musicCatalogGet = musicCatalogRoute.GET;
export const musicTracksUpload = musicTracksRoute.POST;
export const musicTrackUpdate = musicTrackItemRoute.PATCH;
export const musicTrackDelete = musicTrackItemRoute.DELETE;
export const musicLibraryCreate = musicLibrariesRoute.POST;
export const musicLibraryUpdate = musicLibraryItemRoute.PATCH;
export const musicLibraryDelete = musicLibraryItemRoute.DELETE;
