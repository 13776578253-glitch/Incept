// 媒体契约：公开路径、格式白名单与操作形状；文件 IO 在 ../adapters/media-store
// history: 原内嵌于 media-store，模块化时剥离纯契约入 domain
export const musicMediaPublicPath = '/_music-media';

// 镜像最大值 128 MB
export const musicMediaMaxBytes = 128 * 1024 * 1024;

// 白名单：扩展名 → MIME；小写扩展名同时是镜像文件名的后缀
export const musicAudioFormats = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
} as const;

export type MusicAudioExtension = keyof typeof musicAudioFormats;

export type MusicMediaMode = 'publish' | 'dry-run';
export type MusicMediaStatus = 'publish' | 'reuse';

export type MusicSourceInfo = {
  sourcePath: string;
  extension: MusicAudioExtension;
  mimeType: string;
  size: number;
};

export type MusicMediaOperation = MusicSourceInfo & {
  fileName: string;
  targetUrl: string;
  status: MusicMediaStatus;
  repaired?: boolean;
  hash: string;
};

export function isMusicAudioExtension(extension: string): extension is MusicAudioExtension {
  return Object.prototype.hasOwnProperty.call(musicAudioFormats, extension.toLowerCase());
}

// 扩展名被拒时的文案，上传路由与 store 共用
export function musicAudioExtensionError(extension: string): string {
  return `Unsupported music file extension "${extension || '(none)'}". Allowed: ${Object.keys(musicAudioFormats).join(', ')}.`;
}

export function musicMediaFileName(hash: string, extension: string): string {
  return `${hash}${extension.toLowerCase()}`;
}
