// 边界桥接（待裁定）：keys 依计划归 domain，但 node:path 与「domain 禁 Node」口径矛盾（Phase 2 报告 R-KEYS）
// @ts-ignore 仅压住纯层边界（tsconfig.src.json 的 types: []）对 node:path 的拒绝；代码行为零变更
import path from 'node:path';

// key 派生规则：清单生成器与网页上传共用

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

// 曲目身份取自文件名（不含目录）；同名冲突才加 -2 / -3 后缀
export function deriveMusicTrackKey(filename: string, taken: Set<string>): string {
  const extension = path.extname(filename);
  const withoutExtension =
    extension === '' ? filename : filename.slice(0, filename.length - extension.length);

  return uniqueMusicKey(slugifyMusicKey(withoutExtension), taken);
}

// 曲库 key 由名字转写；目录名的数字前缀（01-播客）按生成器约定剥掉
export function deriveMusicLibraryKey(name: string, taken: Set<string>): string {
  const match = /^(\d+)-(.+)$/.exec(name.trim());
  const base = match ? match[2] : name.trim();

  return uniqueMusicKey(slugifyMusicKey(base), taken);
}
