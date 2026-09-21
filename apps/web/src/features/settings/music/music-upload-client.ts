import type { MusicAdminTrack } from '@/server/music/music-admin';

export type UploadResult = { track: MusicAdminTrack; mediaStatus: string };

function readError(payload: string, fallback: string): string {
  try {
    const parsed = JSON.parse(payload) as { error?: unknown };

    return typeof parsed.error === 'string' && parsed.error !== '' ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

// 上传用 XMLHttpRequest 而不是 fetch：只有它能报告上传进度 / 一个请求一个文件，请求体就是文件本身 / 服务端按流落盘，不整块进内存
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
