import type { MusicAdminTrack } from '@incept/music/application';
import type { MusicDuplicateHint } from '@incept/music/domain';

export type MusicUploadMediaStatus = 'published' | 'reused';
export type MusicUploadTrackStatus = 'created' | 'existing' | 'membership-added' | 'deactivated';

export type UploadResult = {
  track: MusicAdminTrack;
  // 镜像是新写下的（published）还是复用了已有文件（reused）
  mediaStatus: MusicUploadMediaStatus;
  // 曲目行是新建（created）还是命中已有内容（existing / membership-added / deactivated）——与媒体是否复用是两件事
  trackStatus: MusicUploadTrackStatus;
  // 标题/歌手/时长相近但内容不同：只提示，不合并
  duplicates: MusicDuplicateHint[];
};

function readError(payload: string, fallback: string): string {
  try {
    const parsed = JSON.parse(payload) as { error?: unknown };

    return typeof parsed.error === 'string' && parsed.error !== '' ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

// 用 XMLHttpRequest 上传：能报进度；一个请求一个文件，请求体就是文件本身
export function uploadMusicFile(
  file: File,
  libraryKey: string,
  options: { onProgress?: (percent: number) => void } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({ filename: file.name, library: libraryKey });
    const request = new XMLHttpRequest();

    request.open('POST', `/api/internal/music/tracks?${query.toString()}`);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as UploadResult);
        } catch {
          reject(new Error('The upload response could not be read.'));
        }

        return;
      }

      reject(new Error(readError(request.responseText, `Upload failed with ${request.status}.`)));
    });

    request.addEventListener('error', () => reject(new Error('The upload could not reach the server.')));
    request.addEventListener('abort', () => reject(new Error('The upload was aborted.')));
    request.send(file);
  });
}
