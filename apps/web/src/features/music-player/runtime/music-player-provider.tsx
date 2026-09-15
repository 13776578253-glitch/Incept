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

import { resolveTrackSource } from '../adapter/mock-music-source';
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
  currentTrack: MusicTrack | null;
  artworkUrl: string | null;
  errorKind: PlayerErrorKind | null;
};

export const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

type MusicPlayerProviderProps = {
  tracks: MusicTrack[];
  children: ReactNode;
};

export function MusicPlayerProvider({ tracks, children }: MusicPlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const appliedTrackIdRef = useRef<string | null>(null);
  const appliedRestartTokenRef = useRef(0);
  const suspendPauseEventsRef = useRef(false);

  const [sourceRevision, setSourceRevision] = useState(0);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<PlayerErrorKind | null>(null);

  const [state, dispatch] = useReducer(
    (current: PlayerState, input: PlayerInput) => reducePlayerState(current, input, Math.random),
    tracks,
    createInitialPlayerState,
  );

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 播放启动的唯一出口：用户手势路径与调和路径都走这里，避免出现两套逻辑。
  const startPlayback = useCallback((trackId: string | null) => {
    const audio = audioRef.current;

    if (!audio || !trackId) return;
    // appliedTrackIdRef 只在该曲目的 src 真正写入后才匹配；未就绪时交给调和 effect 重新触发。
    if (appliedTrackIdRef.current !== trackId) return;
    // 已在播放时重复调用没有意义，同时避免点击路径与调和路径重复触发。
    if (!audio.paused) return;

    requestAudioPlay(audio, dispatch);
  }, []);

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

  // 音源解析：只在 currentTrackId 变化时重新解析，并用 cancelled 挡掉旧曲目的异步结果。
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const trackId = state.currentTrackId;

    if (!trackId) {
      appliedTrackIdRef.current = null;
      audio.removeAttribute('src');
      setArtworkUrl(null);
      return;
    }

    let cancelled = false;

    void resolveTrackSource(trackId)
      .then((source) => {
        if (cancelled) return;

        const element = audioRef.current;
        if (!element) return;

        appliedTrackIdRef.current = trackId;
        suspendPauseEventsRef.current = true;
        element.src = source.audioUrl;
        element.playbackRate = state.playbackRate;
        element.load();
        setArtworkUrl(source.artworkUrl ?? null);
        setSourceRevision((revision) => revision + 1);
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({ type: 'audioErrored', message: 'mock_source_unavailable' });
      });

    return () => {
      cancelled = true;
    };
  }, [state.currentTrackId]);

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
      currentTrack: index >= 0 ? state.queue[index] : null,
      artworkUrl,
      errorKind,
    };
  }, [state, sendIntent, artworkUrl, errorKind]);

  return (
    <MusicPlayerContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" hidden />
      {children}
    </MusicPlayerContext.Provider>
  );
}
