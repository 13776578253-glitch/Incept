export type MusicTrackRecord = {
  id: string;
  trackKey: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  contentHash: string | null;
  mimeType: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  publishedAt: Date | null;
  position: number;
  isActive: boolean;
};

export type MusicLibraryRecord = {
  id: string;
  key: string;
  title: string;
  position: number;
  isActive: boolean;
};

// 仅供导入校验或测试构造形状使用；真实行来自数据库
export type MusicLibraryMembershipRecord = {
  libraryId: string;
  trackId: string;
};

// 导入器写入的形状：audioUrl 由媒体镜像产出，不来自本机路径
export type MusicTrackImportEntry = {
  trackKey: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  contentHash: string;
  mimeType: string;
  fileSize: number;
  durationSeconds: number | null;
  publishedAt: Date | null;
  position: number;
  // 该曲目所属的曲库 key（至少一个）。旧清单模式的调用方补成 ['default']
  libraries: string[];
};

export type MusicLibraryImportEntry = {
  key: string;
  title: string;
  position: number;
};

// 曲目行的写入形状：成员关系是另一张表，行数据里不带 libraries
export type MusicTrackRowEntry = Omit<MusicTrackImportEntry, 'libraries'>;

export type MusicImportSummary = {
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  libraries: {
    created: number;
    updated: number;
    unchanged: number;
    deactivated: number;
  };
  memberships: {
    added: number;
    removed: number;
  };
  warnings: string[];
};
