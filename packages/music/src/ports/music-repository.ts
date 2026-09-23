import type {
  MusicCatalogRecord,
  MusicCatalogTrackRecord,
  MusicImportSummary,
  MusicLibraryImportEntry,
  MusicLibraryMembershipRecord,
  MusicLibraryPatch,
  MusicLibraryRecord,
  MusicTrackImportEntry,
  MusicTrackPatch,
  MusicTrackRecord,
  MusicUploadOutcome,
} from '../domain';

// 用例端口：11 个方法即 music 的全部用例。现状：adapters/prisma 以裸函数导出、消费者直调，尚无 PrismaMusicRepository 实现；
// 端口在 Phase 5（路由收编 + 装配）正式接线。2026-09-23 注记：修正原「已在 adapters/prisma 按此实现」的不符表述
export type MusicRepository = {
  listActiveCatalog: () => Promise<MusicCatalogRecord>;
  listAllTracks: () => Promise<MusicTrackRecord[]>;
  listAllLibraries: () => Promise<MusicLibraryRecord[]>;
  listMemberships: () => Promise<MusicLibraryMembershipRecord[]>;
  importCatalog: (input: {
    // null 表示清单没有声明曲库：旧清单模式
    libraries: MusicLibraryImportEntry[] | null;
    tracks: MusicTrackImportEntry[];
  }) => Promise<MusicImportSummary>;
  uploadTrack: (input: {
    filename: string;
    title: string;
    artist: string | null;
    durationSeconds: number | null;
    audioUrl: string;
    contentHash: string;
    mimeType: string;
    fileSize: number;
    libraryKeys: string[];
  }) => Promise<MusicUploadOutcome>;
  updateTrack: (input: {
    trackKey: string;
    patch: MusicTrackPatch;
  }) => Promise<MusicCatalogTrackRecord>;
  deleteTrack: (input: { trackKey: string }) => Promise<{ trackKey: string }>;
  createLibrary: (input: { key: string; title: string }) => Promise<MusicLibraryRecord>;
  updateLibrary: (input: {
    key: string;
    patch: MusicLibraryPatch;
  }) => Promise<MusicLibraryRecord>;
  deleteLibrary: (input: { key: string }) => Promise<{ key: string }>;
};
