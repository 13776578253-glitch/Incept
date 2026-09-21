'use client';

import {
  createInitialPlayerState,
  reducePlayerState,
  type MusicTrack,
  type PlayerInput,
  type PlayerIntent,
  type PlayerRuntimeEvent,
  type PlayerState,
} from '@incept/music-player-core';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  findCatalogAudioUrl,
  resolveSourceChange,
  toMusicTracks,
  type MusicLibraryCatalogEntry,
  type MusicTrackCatalogEntry,
} from '../adapter/music-source';
import type { TrackCatalogStatus } from '../hooks/use-music-track-catalog';
import {
  applyAudioPause,
  applyAudioPlaybackRate,
  applyAudioSeek,
  attachAudioDriver,
  requestAudioPlay,
} from './audio-element-driver';
import { resolveIntentSideEffect } from './runtime-controller';

export type PlayerErrorKind = 'playRejected' | 'audioError';

export type MusicPlayerContextValue = {
  state: PlayerState;
  sendIntent: (intent: PlayerIntent) => void;
  playTrack: (trackId: string) => void;
  reloadCatalog: () => void;
  currentTrack: MusicTrack | null;
  errorKind: PlayerErrorKind | null;
  // 已按选中曲库过滤过的可见目录
  catalog: MusicTrackCatalogEntry[];
  // 全部启用中的曲库，供切换器渲染
  libraries: MusicLibraryCatalogEntry[];
  catalogStatus: TrackCatalogStatus;
};

export const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

type MusicPlayerProviderProps = {
  catalog: MusicTrackCatalogEntry[];
  libraries: MusicLibraryCatalogEntry[];
  catalogStatus: TrackCatalogStatus;
  onReloadCatalog: () => void;
  children: ReactNode;
};

// unchanged 表示已应用的 trackId 与 URL 都未变
type SourceApplyResult = 'applied' | 'unchanged' | 'replaced' | 'unavailable';

export function MusicPlayerProvider({
  catalog,
  libraries,
  catalogStatus,
  onReloadCatalog,
  children,
}: MusicPlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const appliedTrackIdRef = useRef<string | null>(null);
  const appliedAudioUrlRef = useRef<string | null>(null);
  const appliedRestartTokenRef = useRef(0);
  const suspendPauseEventsRef = useRef(false);

  const [sourceRevision, setSourceRevision] = useState(0);
  const [errorKind, setErrorKind] = useState<PlayerErrorKind | null>(null);

  // 队列初值为空，目录就绪后由 tracksLoaded 替换
  const [state, dispatch] = useReducer(
    (current: PlayerState, input: PlayerInput) => reducePlayerState(current, input, Math.random),
    [],
    createInitialPlayerState,
  );

  const stateRef = useRef(state);
  const catalogRef = useRef(catalog);
  const playbackRateRef = useRef(state.playbackRate);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    playbackRateRef.current = state.playbackRate;
  }, [state.playbackRate]);

  // 目录到达即替换队列，语义由 core 的 setQueue 承担
  useEffect(() => {
    dispatch({ type: 'tracksLoaded', tracks: toMusicTracks(catalog) });
  }, [catalog]);

  // 音源应用的唯一实现：只有 trackId 或 URL 变化才换源
  const applySource = useCallback((trackId: string): SourceApplyResult => {
    const audio = audioRef.current;
    if (!audio) return 'unavailable';

    const audioUrl = findCatalogAudioUrl(catalogRef.current, trackId);
    if (!audioUrl) return 'unavailable';

    const change = resolveSourceChange(
      { trackId: appliedTrackIdRef.current, audioUrl: appliedAudioUrlRef.current },
      { trackId, audioUrl },
    );

    if (change === 'unchanged') {
      return 'unchanged';
    }

    appliedTrackIdRef.current = trackId;
    appliedAudioUrlRef.current = audioUrl;
    suspendPauseEventsRef.current = true;
    audio.src = audioUrl;
    audio.playbackRate = playbackRateRef.current;
    audio.load();
    setSourceRevision((revision) => revision + 1);

    return change;
  }, []);

  // 停用音源并释放旧媒体：pause 后 removeAttribute 再 load
  const releaseSource = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    appliedTrackIdRef.current = null;
    appliedAudioUrlRef.current = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  // 运行时事件的唯一入口：audio 事件与 play() 拒绝都从这里进来，errorKind 只在这里设
  const handleRuntimeEvent = useCallback((event: PlayerRuntimeEvent) => {
    // 切换音源时浏览器补发的 pause 不是用户意图，忽略
    if (event.type === 'playPaused' && suspendPauseEventsRef.current) {
      return;
    }

    switch (event.type) {
      case 'playStarted':
        suspendPauseEventsRef.current = false;
        setErrorKind(null);
        break;
      case 'playRejected':
        suspendPauseEventsRef.current = false;
        setErrorKind('playRejected');
        break;
      case 'audioErrored':
        suspendPauseEventsRef.current = false;
        setErrorKind('audioError');
        break;
      case 'trackLoaded':
        suspendPauseEventsRef.current = false;
        break;
      default:
        break;
    }

    dispatch(event);
  }, []);

  // 播放启动的唯一出口：applySource 与 play() 同步执行，保住用户手势的 user activation
  const startPlayback = useCallback(
    (trackId: string | null) => {
      const audio = audioRef.current;

      if (!audio || !trackId) return;

      const sourceState = applySource(trackId);

      if (sourceState === 'unavailable') return;
      // 已在播放时重复调用没有意义，避免点击路径与调和路径重复触发
      if (!audio.paused) return;

      requestAudioPlay(audio, handleRuntimeEvent);
    },
    [applySource, handleRuntimeEvent],
  );

  // 选中并播放走同一条路径，不拆成两个 intent
  const playTrack = useCallback(
    (trackId: string) => {
      dispatch({ type: 'selectTrackRequested', trackId });
      dispatch({ type: 'playRequested' });
      startPlayback(trackId);
    },
    [startPlayback],
  );

  // 唯一 audio owner 的事件绑定：挂载时绑定一次，卸载时清理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const driver = attachAudioDriver(audio, handleRuntimeEvent);

    return () => driver.dispose();
  }, [handleRuntimeEvent]);

  // 音源写入：目录换引用会重新进入，未变化的音源由 applySource 空操作处理
  useEffect(() => {
    const trackId = state.currentTrackId;

    if (!trackId) {
      releaseSource();
      return;
    }

    const sourceState = applySource(trackId);

    if (sourceState === 'unavailable') {
      releaseSource();
      return;
    }

    if (sourceState === 'replaced') {
      dispatch({ type: 'selectTrackRequested', trackId });
    }
  }, [state.currentTrackId, catalog, applySource, releaseSource]);

  // 调和：音源就绪后才自动启动播放；restartToken 变化表示从 0 秒重播
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (appliedTrackIdRef.current !== state.currentTrackId) return;

    if (appliedRestartTokenRef.current !== state.restartToken) {
      appliedRestartTokenRef.current = state.restartToken;
      audio.currentTime = 0;
    }

    if (state.status !== 'loading') return;

    // 自动续播、repeat-one 重播，音源就绪前用户已点过播放
    startPlayback(state.currentTrackId);
  }, [state.status, state.restartToken, state.currentTrackId, sourceRevision, startPlayback]);

  const sendIntent = useCallback(
    (intent: PlayerIntent) => {
      const audio = audioRef.current;
      const effect = resolveIntentSideEffect(intent, stateRef.current);

      dispatch(intent);

      if (intent.type === 'playRequested') {
        // 直接调用 play()，避免等到 effect 时丢失 transient user activation
        // playRequested 不改变当前曲目
        startPlayback(stateRef.current.currentTrackId);
        return;
      }

      if (!audio) return;

      switch (effect.kind) {
        case 'pause':
          applyAudioPause(audio);
          break;
        case 'seek':
          applyAudioSeek(audio, effect.seconds);
          break;
        case 'playbackRate':
          applyAudioPlaybackRate(audio, effect.rate);
          break;
        default:
          break;
      }
    },
    [startPlayback],
  );

  const value = useMemo<MusicPlayerContextValue>(() => {
    const index = state.currentTrackId
      ? state.queue.findIndex((track) => track.id === state.currentTrackId)
      : -1;

    return {
      state,
      sendIntent,
      playTrack,
      reloadCatalog: onReloadCatalog,
      currentTrack: index >= 0 ? state.queue[index] : null,
      errorKind,
      catalog,
      libraries,
      catalogStatus,
    };
  }, [state, sendIntent, playTrack, onReloadCatalog, errorKind, catalog, libraries, catalogStatus]);

  return (
    <MusicPlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" hidden />
      {children}
    </MusicPlayerContext.Provider>
  );
}
