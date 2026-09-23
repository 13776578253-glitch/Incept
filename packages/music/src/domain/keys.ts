// R-KEYS 裁定（选 A）：文件名工具为纯实现，语义 POSIX-only——目录分隔符只有 '/'，'\' 是普通字符
function baseNameOf(file: string): string {
  const trimmed = file.replace(/\/+$/u, '');

  if (trimmed === '') {
    return '';
  }

  const slash = trimmed.lastIndexOf('/');

  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

// 扩展名取自最后一段文件名的最后一个 '.'；'.' 位于段首（如 .hidden）或整段恰为 '..' 时没有扩展名
function extensionOf(file: string): string {
  const base = baseNameOf(file);
  const dot = base.lastIndexOf('.');

  if (dot <= 0) return '';

  if (dot === base.length - 1) {
    return base === '..' ? '' : base.slice(dot);
  }

  return base.slice(dot);
}

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
  const base = baseNameOf(file);
  const extension = extensionOf(base);
  const stem = extension === '' ? base : base.slice(0, base.length - extension.length);

  return stem.replace(/[-_]+/g, ' ').trim() || stem;
}

// 曲目身份取自文件名（不含目录）；同名冲突才加 -2 / -3 后缀
export function deriveMusicTrackKey(filename: string, taken: Set<string>): string {
  const extension = extensionOf(filename);
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
