import type { RepeatMode } from '../../../core';

export type PlayerLocale = 'zh' | 'en';

export type PlayerCopy = {
  formatPlaylistHeading: (count: number) => string;
  emptyQueue: string;
  play: string;
  pause: string;
  previous: string;
  next: string;
  expand: string;
  collapse: string;
  expandList: string;
  collapseList: string;
  closePlaylist: string;
  dragHandle: string;
  playbackRate: string;
  repeatMode: string;
  repeatModes: Record<RepeatMode, string>;
  playRejected: string;
  audioError: string;
  catalogLoading: string;
  catalogError: string;
  catalogRetry: string;
  librarySwitcherLabel: string;
  allLibraries: string;
  defaultLibraryLabel: string;
};

const zhCopy: PlayerCopy = {
  formatPlaylistHeading: (count) => `列表（${count}）`,
  emptyQueue: '暂时没有可播放的内容',
  play: '播放',
  pause: '暂停',
  previous: '上一首',
  next: '下一首',
  expand: '展开播放器',
  collapse: '收起播放器',
  expandList: '展开播放列表',
  collapseList: '收起播放列表',
  closePlaylist: '关闭播放列表',
  dragHandle: '拖动播放器',
  playbackRate: '播放速度',
  repeatMode: '播放模式',
  repeatModes: {
    off: '顺序播放',
    all: '列表循环',
    one: '单曲循环',
    shuffle: '随机播放',
  },
  playRejected: '浏览器阻止了自动播放，请再次点击播放',
  audioError: '音频加载失败',
  catalogLoading: '正在载入曲目',
  catalogError: '曲目列表加载失败',
  catalogRetry: '重试',
  librarySwitcherLabel: '曲库',
  allLibraries: '全部',
  defaultLibraryLabel: '默认',
};

const enCopy: PlayerCopy = {
  formatPlaylistHeading: (count) => `Playlist (${count})`,
  emptyQueue: 'Nothing to play yet',
  play: 'Play',
  pause: 'Pause',
  previous: 'Previous',
  next: 'Next',
  expand: 'Expand player',
  collapse: 'Collapse player',
  expandList: 'Expand playlist',
  collapseList: 'Collapse playlist',
  closePlaylist: 'Close playlist',
  dragHandle: 'Drag player',
  playbackRate: 'Playback speed',
  repeatMode: 'Playback mode',
  repeatModes: {
    off: 'Play in order',
    all: 'Repeat playlist',
    one: 'Repeat one',
    shuffle: 'Shuffle',
  },
  playRejected: 'The browser blocked autoplay. Press play again.',
  audioError: 'Audio failed to load',
  catalogLoading: 'Loading tracks',
  catalogError: 'Track list failed to load',
  catalogRetry: 'Retry',
  librarySwitcherLabel: 'Libraries',
  allLibraries: 'All',
  defaultLibraryLabel: 'Default',
};

const copies: Record<PlayerLocale, PlayerCopy> = {
  zh: zhCopy,
  en: enCopy,
};

const monthLabels: Record<PlayerLocale, string[]> = {
  zh: [],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function resolvePlayerLocale(locale: string): PlayerLocale {
  return locale === 'en' ? 'en' : 'zh';
}

export function getPlayerCopy(locale: string): PlayerCopy {
  return copies[resolvePlayerLocale(locale)];
}

export function formatPlaybackRate(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

// default 是清单里的机械 key，界面显示本地化文案
export function formatLibraryLabel(
  library: { key: string; title: string },
  copy: PlayerCopy,
): string {
  return library.key === 'default' ? copy.defaultLibraryLabel : library.title;
}

// 倍速档位
export const PLAYBACK_RATE_OPTIONS = [0.5, 0.8, 1, 1.5, 2] as const;

export function getNextPlaybackRate(current: number): number {
  const index = PLAYBACK_RATE_OPTIONS.findIndex((rate) => Math.abs(rate - current) < 0.001);

  return PLAYBACK_RATE_OPTIONS[(index + 1) % PLAYBACK_RATE_OPTIONS.length];
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatTrackDate(locale: string, isoDate: string): string {
  // 只取 ISO 时间戳的日期部分
  const [year, month, day] = isoDate.slice(0, 10).split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return isoDate;
  }

  if (resolvePlayerLocale(locale) === 'zh') {
    return `${month}月${day}日`;
  }

  return `${monthLabels.en[month - 1]} ${day}`;
}
