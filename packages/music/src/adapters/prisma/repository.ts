import { importMusicCatalog } from './import';
import {
  createMusicLibrary,
  deleteMusicLibrary,
  deleteMusicTrack,
  updateMusicLibrary,
  updateMusicTrack,
} from './manage';
import {
  listActiveMusicCatalog,
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
} from './queries/list';
import { uploadMusicTrack } from './upload';

import type { MusicRepository } from '../../ports';

// PrismaMusicRepository：MusicRepository 端口的 Prisma 实现（决策 4），薄封装既有执行函数
export function createPrismaMusicRepository(): MusicRepository {
  return {
    listActiveCatalog: listActiveMusicCatalog,
    listAllTracks: listAllMusicTracks,
    listAllLibraries: listAllMusicLibraries,
    listMemberships: listMusicLibraryMemberships,
    importCatalog: importMusicCatalog,
    uploadTrack: uploadMusicTrack,
    updateTrack: updateMusicTrack,
    deleteTrack: deleteMusicTrack,
    createLibrary: createMusicLibrary,
    updateLibrary: updateMusicLibrary,
    deleteLibrary: deleteMusicLibrary,
  };
}
