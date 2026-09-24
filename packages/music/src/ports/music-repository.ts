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

// 用例端口：11 个方法覆盖 music 的完整数据用例契约
// history: 最初 adapters/prisma 裸函数直调，Phase 5 统一接线至 PrismaMusicRepository
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
