// 上传白名单的客户端副本：先过滤再发请求，服务端另有校验
export const musicUploadExtensions = ['.mp3', '.wav', '.flac', '.ncm'] as const;

export function isUploadableMusicFileName(name: string): boolean {
  const lower = name.toLowerCase();

  return musicUploadExtensions.some((extension) => lower.endsWith(extension));
}

// 不支持的扩展名不静默丢弃：分区返回，界面汇总成一行
export function partitionMusicUploadFiles<T extends { name: string }>(
  files: T[],
): { candidates: T[]; skipped: T[] } {
  const candidates: T[] = [];
  const skipped: T[] = [];

  for (const file of files) {
    (isUploadableMusicFileName(file.name) ? candidates : skipped).push(file);
  }

  return { candidates, skipped };
}
