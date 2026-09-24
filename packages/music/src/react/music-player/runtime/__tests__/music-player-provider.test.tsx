import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installMediaElementMocks, type MediaElementMocks } from '../../../../testing/media-element';
import { makeCatalog, makeMixedCatalog, validCatalogTrack } from '../../../../testing/music-fixtures';

import {
  filterCatalogByLibrary,
  toMusicCatalog,
  type MusicCatalog,
} from '../../adapter/music-source';
import { useMusicPlayer } from '../../hooks/use-music-player';
import { MusicPlayerProvider, type MusicPlayerContextValue } from '../music-player-provider';

let media: MediaElementMocks;

beforeEach(() => {
  media = installMediaElementMocks();
});

afterEach(() => {
  // 先卸载再还原桩：卸载过程中或卸载后落地的浏览器调用不能打到真实的 jsdom 实现上（那会打出 "Not implemented" 噪声）
  cleanup();
  media.restore();
});

function renderPlayer(catalog: MusicCatalog) {
  const latest: { current: MusicPlayerContextValue | null } = { current: null };
  const onReloadCatalog = vi.fn();

  function Probe() {
    latest.current = useMusicPlayer();
    return null;
  }

  function tree(nextCatalog: MusicCatalog) {
    return (
      <MusicPlayerProvider
        catalog={nextCatalog.entries}
        libraries={nextCatalog.libraries}
        catalogStatus="ready"
        onReloadCatalog={onReloadCatalog}
      >
        <Probe />
      </MusicPlayerProvider>
    );
  }

  const view = render(tree(catalog));
  const audio = view.container.querySelector('audio');

  if (!audio) {
    throw new Error('the provider did not render its audio element');
  }

  return {
    latest,
    onReloadCatalog,
    audio,
    rerender: (nextCatalog: MusicCatalog) => view.rerender(tree(nextCatalog)),
  };
}

function catalogWithAudioUrl(audioUrl: string): MusicCatalog {
  return toMusicCatalog({
    libraries: [{ key: 'default', title: 'default', position: 1 }],
    tracks: [{ ...validCatalogTrack, trackKey: 'demo-01', audioUrl, libraries: ['default'] }],
  });
}

it('loads the catalog into the queue and applies the first source without playing', () => {
  const { latest, audio } = renderPlayer(makeCatalog(3));

  expect(latest.current!.state.queue.map((track) => track.id)).toEqual([
    'demo-01',
    'demo-02',
    'demo-03',
  ]);
  expect(latest.current!.state.currentTrackId).toBe('demo-01');
  expect(latest.current!.state.status).toBe('paused');
  expect(audio.getAttribute('src')).toBe('/_music-media/track-01.wav');
  expect(media.load).toHaveBeenCalled();
  expect(media.play).not.toHaveBeenCalled();
});

it('starts playback on the click path and reports playing only after the play event', () => {
  const { latest, audio } = renderPlayer(makeCatalog(2));

  act(() => {
    latest.current!.playTrack('demo-02');
  });

  expect(media.play).toHaveBeenCalled();
  expect(latest.current!.state.status).toBe('loading');
  expect(audio.getAttribute('src')).toBe('/_music-media/track-02.wav');

  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');
  expect(latest.current!.errorKind).toBeNull();
});

it('surfaces a rejected play() through the runtime error kind', async () => {
  const { latest, audio } = renderPlayer(makeCatalog(1));

  media.play.mockRejectedValue(new Error('NotAllowedError'));

  act(() => {
    latest.current!.playTrack('demo-01');
  });

  await waitFor(() => expect(latest.current!.errorKind).toBe('playRejected'));

  expect(latest.current!.state.status).toBe('paused');
  expect(latest.current!.state.errorMessage).toBe('NotAllowedError');

  media.play.mockResolvedValue(undefined);

  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.errorKind).toBeNull();
});

it('surfaces an audio element error', () => {
  const { latest, audio } = renderPlayer(makeCatalog(1));

  act(() => {
    media.dispatch(audio, 'error');
  });

  expect(latest.current!.errorKind).toBe('audioError');
  expect(latest.current!.state.status).toBe('errored');
});

it('reports a media error, not an autoplay block, when play() is rejected by a broken source', async () => {
  const { latest, audio } = renderPlayer(makeCatalog(1));

  // 源取不到（404 等）时元素上会有媒体错误，play() 的拒绝属于加载失败
  media.setError(audio, 4);
  media.play.mockRejectedValue(new Error('NotSupportedError'));

  act(() => {
    latest.current!.playTrack('demo-01');
  });

  await waitFor(() => expect(latest.current!.errorKind).toBe('audioError'));
  expect(latest.current!.state.status).toBe('errored');
});

it('restarts from zero when the same track is served from a new URL', () => {
  const { latest, audio, rerender } = renderPlayer(catalogWithAudioUrl('/_music-media/old.wav'));

  act(() => {
    latest.current!.playTrack('demo-01');
  });
  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');

  audio.currentTime = 42;
  const restartToken = latest.current!.state.restartToken;

  rerender(catalogWithAudioUrl('/_music-media/new.wav'));

  expect(audio.getAttribute('src')).toBe('/_music-media/new.wav');
  expect(latest.current!.state.restartToken).toBe(restartToken + 1);
  expect(audio.currentTime).toBe(0);
});

it('ignores the pause event the browser emits during a source swap', () => {
  const { latest, audio, rerender } = renderPlayer(catalogWithAudioUrl('/_music-media/old.wav'));

  act(() => {
    latest.current!.playTrack('demo-01');
  });
  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');

  rerender(catalogWithAudioUrl('/_music-media/new.wav'));

  expect(latest.current!.state.status).toBe('loading');

  act(() => {
    media.dispatch(audio, 'pause');
  });

  expect(latest.current!.state.status).toBe('loading');

  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');
});

it('does not reload the source when an equal catalog array replaces it', () => {
  const entries = makeCatalog(2);
  const { audio, rerender } = renderPlayer(entries);

  const loadCalls = media.load.mock.calls.length;

  rerender({ ...entries, entries: [...entries.entries] });

  expect(media.load.mock.calls.length).toBe(loadCalls);
  expect(media.play).not.toHaveBeenCalled();
  expect(audio.getAttribute('src')).toBe('/_music-media/track-01.wav');
});

it('releases the source when the queue empties', () => {
  const catalog = makeCatalog(1);
  const { latest, audio, rerender } = renderPlayer(catalog);

  expect(audio.hasAttribute('src')).toBe(true);

  rerender({ ...catalog, entries: [] });

  expect(audio.hasAttribute('src')).toBe(false);
  expect(latest.current!.state.status).toBe('idle');
  expect(latest.current!.errorKind).toBeNull();
});

it('routes pauseRequested to the audio element', () => {
  const { latest } = renderPlayer(makeCatalog(1));

  act(() => {
    latest.current!.sendIntent({ type: 'pauseRequested' });
  });

  expect(media.pause).toHaveBeenCalled();
});

it('seeks through the element once a duration is known', () => {
  const { latest, audio } = renderPlayer(makeCatalog(1));

  act(() => {
    latest.current!.sendIntent({ type: 'seekRequested', seconds: 42 });
  });

  expect(audio.currentTime).toBe(0);

  media.setDuration(audio, 268);

  act(() => {
    latest.current!.sendIntent({ type: 'seekRequested', seconds: 42 });
  });

  expect(audio.currentTime).toBe(42);
  expect(latest.current!.state.currentTime).toBe(42);
});

it('applies an in-range playback rate and ignores an out-of-range one', () => {
  const { latest, audio } = renderPlayer(makeCatalog(1));

  act(() => {
    latest.current!.sendIntent({ type: 'playbackRateRequested', rate: 1.5 });
  });

  expect(audio.playbackRate).toBe(1.5);
  expect(latest.current!.state.playbackRate).toBe(1.5);

  act(() => {
    latest.current!.sendIntent({ type: 'playbackRateRequested', rate: 99 });
  });

  expect(audio.playbackRate).toBe(1.5);
  expect(latest.current!.state.playbackRate).toBe(1.5);
});

it('forwards reloadCatalog to its owner', () => {
  const { latest, onReloadCatalog } = renderPlayer(makeCatalog(1));

  act(() => {
    latest.current!.reloadCatalog();
  });

  expect(onReloadCatalog).toHaveBeenCalledTimes(1);
});

it('exposes the libraries to the player surface', () => {
  const { latest } = renderPlayer(makeMixedCatalog());

  expect(latest.current!.libraries.map((library) => library.key)).toEqual(['播客', '音乐']);
});

it('swaps the queue when the visible library changes and keeps the current track', () => {
  const catalog = makeMixedCatalog();
  const { latest, audio, rerender } = renderPlayer(catalog);

  expect(latest.current!.state.queue.map((track) => track.id)).toEqual([
    'pod-01',
    'music-01',
    'both-01',
  ]);

  act(() => {
    latest.current!.playTrack('both-01');
  });
  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');

  rerender({ ...catalog, entries: filterCatalogByLibrary(catalog.entries, '播客') });

  expect(latest.current!.state.queue.map((track) => track.id)).toEqual(['pod-01', 'both-01']);
  expect(latest.current!.state.currentTrackId).toBe('both-01');
  expect(latest.current!.state.status).toBe('playing');
  expect(audio.getAttribute('src')).toBe('/_music-media/both-01.wav');
});

it('moves the cursor to the new head when the current track leaves the view', () => {
  const catalog = makeMixedCatalog();
  const { latest, audio, rerender } = renderPlayer(catalog);

  act(() => {
    latest.current!.playTrack('music-01');
  });
  act(() => {
    media.dispatch(audio, 'play');
  });

  expect(latest.current!.state.status).toBe('playing');

  rerender({ ...catalog, entries: filterCatalogByLibrary(catalog.entries, '播客') });

  // 换了曲目仍继续播：核心的 setQueue 语义，决策文档已记为后果
  expect(latest.current!.state.currentTrackId).toBe('pod-01');
  expect(latest.current!.state.status).toBe('loading');
  expect(audio.getAttribute('src')).toBe('/_music-media/pod-01.wav');
});
