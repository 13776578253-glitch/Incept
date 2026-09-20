import path from 'node:path';

// 清单生成器与网页上传共用同一套命名规则：内容身份（trackKey）与曲库 key 必须长得一样，
// 否则同一份内容从两条路进来会得到两个不同的身份。

export function slugifyMusicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z\u4e00-\u9fff_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function uniqueMusicKey(base: string, taken: Set<string>): string {
  const fallback = base === '' ? 'track' : base;

  if (!taken.has(fallback)) return fallback;

  let suffix = 2;
  while (taken.has(`${fallback}-${suffix}`)) suffix += 1;

  return `${fallback}-${suffix}`;
}

export function titleFromFileName(file: string): string {
  const base = path.basename(file, path.extname(file));

  return base.replace(/[-_]+/g, ' ').trim() || base;
}

// 上传曲目的身份来自文件名（不含目录）：同一首歌再次上传会得到 -2 / -3 后缀，不会撞车
export function deriveMusicTrackKey(filename: string, taken: Set<string>): string {
  const extension = path.extname(filename);
  const withoutExtension =
    extension === '' ? filename : filename.slice(0, filename.length - extension.length);

  return uniqueMusicKey(slugifyMusicKey(withoutExtension), taken);
}

// 曲库 key 由名字转写；目录名常见的数字前缀（01-播客）按生成器的约定剥掉
export function deriveMusicLibraryKey(name: string, taken: Set<string>): string {
  const match = /^(\d+)-(.+)$/.exec(name.trim());
  const base = match ? match[2] : name.trim();

  return uniqueMusicKey(slugifyMusicKey(base), taken);
}
