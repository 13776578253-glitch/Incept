'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// 与 core 的 RepeatMode 取值一一对应 /重新声明而不是从 core 导入，偏好层不依赖播放器内核：两边都指向同一组字符串，改动时会同时被类型检查抓到
export type MusicPlaybackMode = 'off' | 'all' | 'one' | 'shuffle';

export type MusicPlayerPreferencesValue = {
  playbackRateLocked: boolean;
  rememberPlacement: boolean;
  playbackMode: MusicPlaybackMode;
  // 选中的曲库 key；null 表示"全部"视图
  selectedLibrary: string | null;
  isReady: boolean;
  setPlaybackRateLocked: (locked: boolean) => void;
  setRememberPlacement: (remember: boolean) => void;
  setPlaybackMode: (mode: MusicPlaybackMode) => void;
  setSelectedLibrary: (key: string | null) => void;
};

type StoredPreferences = {
  playbackRateLocked: boolean;
  rememberPlacement: boolean;
  playbackMode: MusicPlaybackMode;
  selectedLibrary: string | null;
};

const STORAGE_KEY = 'incept-music-player-preferences';

// 默认锁速：访客表现为固定 1x
const DEFAULT_PREFERENCES: StoredPreferences = {
  playbackRateLocked: true,
  rememberPlacement: true,
  playbackMode: 'off',
  selectedLibrary: null,
};

const PLAYBACK_MODES: MusicPlaybackMode[] = ['off', 'all', 'one', 'shuffle'];

export const MusicPlayerPreferencesContext = createContext<MusicPlayerPreferencesValue | null>(null);

function readStoredPreferences(): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return DEFAULT_PREFERENCES;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_PREFERENCES;
    }

    const record = parsed as Partial<Record<keyof StoredPreferences, unknown>>;
    const playbackMode = record.playbackMode;
    const selectedLibrary = record.selectedLibrary;

    return {
      playbackRateLocked:
        typeof record.playbackRateLocked === 'boolean'
          ? record.playbackRateLocked
          : DEFAULT_PREFERENCES.playbackRateLocked,
      rememberPlacement:
        typeof record.rememberPlacement === 'boolean'
          ? record.rememberPlacement
          : DEFAULT_PREFERENCES.rememberPlacement,
      playbackMode:
        typeof playbackMode === 'string' && PLAYBACK_MODES.includes(playbackMode as MusicPlaybackMode)
          ? (playbackMode as MusicPlaybackMode)
          : DEFAULT_PREFERENCES.playbackMode,
      // 库里是否真的存在由目录决定；这里只保证类型，失效的 key 由播放器在目录就绪后清理
      selectedLibrary:
        typeof selectedLibrary === 'string' && selectedLibrary.trim() !== '' ? selectedLibrary : null,
    };
  } catch {
    // 存储不可用或内容损坏时退回默认值
    return DEFAULT_PREFERENCES;
  }
}

function storePreferences(preferences: StoredPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 存储被禁用时静默失败：偏好只在当前会话内生效
  }
}

export function MusicPlayerPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<StoredPreferences>(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setPreferences(readStoredPreferences());
    setIsReady(true);
  }, []);

  // 持久化放在 effect 里，让状态更新函数保持纯粹：StrictMode 下更新函数会被重复调用
  // 并发渲染下读到的 current 还可能是过期值 / isReady 同时充当闸门：首次写入必须发生在读完存储之后，否则会把默认值覆盖掉用户已存的偏好
  useEffect(() => {
    if (!isReady) return;

    storePreferences(preferences);
  }, [isReady, preferences]);

  const update = useCallback((patch: Partial<StoredPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const setPlaybackRateLocked = useCallback(
    (locked: boolean) => update({ playbackRateLocked: locked }),
    [update],
  );
  const setRememberPlacement = useCallback(
    (remember: boolean) => update({ rememberPlacement: remember }),
    [update],
  );
  const setPlaybackMode = useCallback(
    (mode: MusicPlaybackMode) => update({ playbackMode: mode }),
    [update],
  );
  const setSelectedLibrary = useCallback(
    (key: string | null) => update({ selectedLibrary: key }),
    [update],
  );

  const value = useMemo<MusicPlayerPreferencesValue>(
    () => ({
      ...preferences,
      isReady,
      setPlaybackRateLocked,
      setRememberPlacement,
      setPlaybackMode,
      setSelectedLibrary,
    }),
    [
      preferences,
      isReady,
      setPlaybackRateLocked,
      setRememberPlacement,
      setPlaybackMode,
      setSelectedLibrary,
    ],
  );

  return (
    <MusicPlayerPreferencesContext.Provider value={value}>
      {children}
    </MusicPlayerPreferencesContext.Provider>
  );
}
