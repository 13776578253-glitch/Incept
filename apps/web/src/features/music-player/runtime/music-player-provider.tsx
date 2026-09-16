'use client';

import {
  createInitialPlayerState,
  reducePlayerState,
  type MusicTrack,
  type PlayerInput,
  type PlayerIntent,
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
  toMusicTracks,
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
  catalog: MusicTrackCatalogEntry[];
  catalogStatus: TrackCatalogStatus;
};

export const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

type MusicPlayerProviderProps = {
  catalog: MusicTrackCatalogEntry[];
  catalogStatus: TrackCatalogStatus;
  onReloadCatalog: () => void;
  children: ReactNode;
};

// 音源应用的结果。unchanged 表示当前已应用的 trackId 与 URL 都未变，不需要换源。
type SourceApplyResult = 'applied' | 'unchanged' | 'replaced' | 'unavailable';

export function MusicPlayerProvider({
  catalog,
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

  // 队列初值为空：目录异步到达，初值不可能是真实数据。
  // 目录就绪后由 tracksLoaded 替换队列，这正是 core 需要该输入的原因。
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

  // 目录到达即替换队列。语义由 core 的 setQueue 承担：当前曲目仍在队列中时保留曲目、
  // 播放状态与播放位置；已被移除时游标回到新队首；空队列与非空队列之间的切换同理。
  useEffect(() => {
    dispatch({ type: 'tracksLoaded', tracks: toMusicTracks(catalog) });
  }, [catalog]);

  // 音源应用的唯一实现。只有 trackId 或 URL 真的变化才换源：
  // 目录数组换引用不是换源理由，否则会无条件 load() 打断正在播放的音频，
  // 而 core 仍认为在播放，形成"界面在播、实际静音且进度丢失"的脱节。
  const applySource = useCallback((trackId: string): SourceApplyResult => {
    const audio = audioRef.current;
    if (!audio) return 'unavailable';

    const audioUrl = findCatalogAudioUrl(catalogRef.current, trackId);
    if (!audioUrl) return 'unavailable';

    if (appliedTrackIdRef.current === trackId && appliedAudioUrlRef.current === audioUrl) {
      return 'unchanged';
    }

    const sameTrack = appliedTrackIdRef.current === trackId;

    appliedTrackIdRef.current = trackId;
    appliedAudioUrlRef.current = audioUrl;
    suspendPauseEventsRef.current = true;
    audio.src = audioUrl;
    audio.playbackRate = playbackRateRef.current;
    audio.load();
    setSourceRevision((revision) => revision + 1);

    // 同一个 trackId 换了 URL 说明内容被替换。按契约这不该发生（内容变化应换新 trackKey），
    // 真发生时按"从头重播"处理：由调用方派发一次重新选曲，让 core 递增 restartToken 并进入 loading。
    return sameTrack ? 'replaced' : 'applied';
  }, []);

  // 停用音源并让浏览器真正释放旧媒体：只 removeAttribute 不足以释放，必须显式 pause 后再 load。
  const releaseSource = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    appliedTrackIdRef.current = null;
    appliedAudioUrlRef.current = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, []);

  // 播放启动的唯一出口。applySource 在这里同步完成，因此 play() 始终落在调用方的调用栈内：
  // 用户点击路径因此保留 transient user activation，不依赖后续 effect 补发。
  const startPlayback = useCallback(
    (trackId: string | null) => {
      const audio = audioRef.current;

      if (!audio || !trackId) return;

      const sourceState = applySource(trackId);

      if (sourceState === 'unavailable') return;
      // 已在播放时重复调用没有意义，同时避免点击路径与调和路径重复触发。
      if (!audio.paused) return;

      requestAudioPlay(audio, dispatch);
    },
    [applySource],
  );

  // 原子路径：选中并播放指定曲目。不拆成两个 intent 连续派发，
  // 因为第二次派发时 stateRef 尚未更新，会拿旧 currentTrackId 去启动播放。
  const playTrack = useCallback(
    (trackId: string) => {
      dispatch({ type: 'selectTrackRequested', trackId });
      dispatch({ type: 'playRequested' });
      startPlayback(trackId);
    },
    [startPlayback],
  );

  // 唯一 audio owner 的事件绑定：挂载时绑定一次，卸载时清理。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const driver = attachAudioDriver(audio, (event) => {
      // 切换音源时浏览器会补发一次 pause，那不是用户意图，不能让它覆盖新曲目的状态。
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
    });

    return () => driver.dispose();
  }, []);

  // 音源写入：目录换引用（例如重试成功）会重新进入这里，但 applySource 对未变化的音源是空操作。
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

  // 调和：音源就绪之后才允许自动启动播放；restartToken 变化表示"从 0 秒重播"。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (appliedTrackIdRef.current !== state.currentTrackId) return;

    if (appliedRestartTokenRef.current !== state.restartToken) {
      appliedRestartTokenRef.current = state.restartToken;
      audio.currentTime = 0;
    }

    if (state.status !== 'loading') return;

    // 自动续播、repeat-one 重播，以及"音源就绪前用户已点过播放"都从这里启动。
    startPlayback(state.currentTrackId);
  }, [state.status, state.restartToken, state.currentTrackId, sourceRevision, startPlayback]);

  const sendIntent = useCallback(
    (intent: PlayerIntent) => {
      const audio = audioRef.current;
      const effect = resolveIntentSideEffect(intent, stateRef.current);

      dispatch(intent);

      if (intent.type === 'playRequested') {
        // 必须在用户手势的调用栈里直接调用 play()：
        // 等到 effect 再执行时浏览器可能已经丢弃 transient user activation，从而拒绝播放。
        // playRequested 不改变当前曲目，因此这里读 stateRef 是安全的。
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
      catalogStatus,
    };
  }, [state, sendIntent, playTrack, onReloadCatalog, errorKind, catalog, catalogStatus]);

  return (
    <MusicPlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" hidden />
      {children}
    </MusicPlayerContext.Provider>
  );
}
