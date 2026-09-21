export { importMusicCatalog } from './import';
export {
  deriveMusicLibraryKey,
  deriveMusicTrackKey,
  slugifyMusicKey,
  titleFromFileName,
  uniqueMusicKey,
} from './keys';
export {
  createMusicLibrary,
  deleteMusicLibrary,
  deleteMusicTrack,
  planMusicLibraryCreate,
  planMusicLibraryDelete,
  planMusicLibraryUpdate,
  planMusicTrackCreate,
  planMusicTrackUpdate,
  updateMusicLibrary,
  updateMusicTrack,
} from './manage';
export { planMusicImport } from './plan';
export {
  findMusicDuplicateCandidates,
  isMusicUniqueConflict,
  planMusicUploadDecision,
  uploadMusicTrack,
} from './upload';
export {
  listActiveMusicCatalog,
  listActiveMusicTracks,
  listAllMusicLibraries,
  listAllMusicTracks,
  listMusicLibraryMemberships,
} from './queries/list';

export type { MusicCatalogRecord, MusicCatalogTrackRecord } from './queries/list';
export type { MusicLibraryPatch, MusicTrackPatch } from './manage';
export type { ExistingMusicState, MusicImportMode, MusicImportPlan, MusicImportPlanInput } from './plan';
export type {
  MusicDuplicateHint,
  MusicUploadDecision,
  MusicUploadOutcome,
  MusicUploadStatus,
} from './upload';
export type {
  MusicImportSummary,
  MusicLibraryImportEntry,
  MusicLibraryMembershipRecord,
  MusicLibraryRecord,
  MusicTrackImportEntry,
  MusicTrackRecord,
  MusicTrackRowEntry,
} from './types';
