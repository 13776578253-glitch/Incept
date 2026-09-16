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

// 导入器写入的形状：audioUrl 由媒体镜像产出，绝不来自本机路径
export type MusicTrackImportEntry = {
  trackKey: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  contentHash: string;
  mimeType: string;
  fileSize: number;
  publishedAt: Date | null;
  position: number;
};

export type MusicImportSummary = {
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  warnings: string[];
};
