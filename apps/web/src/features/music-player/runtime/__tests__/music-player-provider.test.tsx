import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installMediaElementMocks, type MediaElementMocks } from '@/test/media-element';
import { makeCatalogEntries, validCatalogTrack } from '@/test/music-fixtures';

import { toCatalogEntries, type MusicTrackCatalogEntry } from '../../adapter/music-source';
import { useMusicPlayer } from '../../hooks/use-music-player';
import { MusicPlayerProvider, type MusicPlayerContextValue } from '../music-player-provider';

let media: MediaElementMocks;

beforeEach(() => {
  media = installMediaElementMocks();
});

afterEach(() => {
  media.restore();
});

function renderPlayer(catalog: MusicTrackCatalogEntry[]) {
  const latest: { current: MusicPlayerContextValue | null } = { current: null };
  const onReloadCatalog = vi.fn();

  function Probe() {
    latest.current = useMusicPlayer();
    return null;
  }

  function tree(nextCatalog: MusicTrackCatalogEntry[]) {
    return (
      <MusicPlayerProvider
        catalog={nextCatalog}
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
    rerender: (nextCatalog: MusicTrackCatalogEntry[]) => view.rerender(tree(nextCatalog)),
  };
}

function catalogWithAudioUrl(audioUrl: string) {
  return toCatalogEntries({
    tracks: [{ ...validCatalogTrack, trackKey: 'demo-01', audioUrl }],
  });
}

it('loads the catalog into the queue and applies the first source without playing', () => {
  const { latest, audio } = renderPlayer(makeCatalogEntries(3));

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
  const { latest, audio } = renderPlayer(makeCatalogEntries(2));

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
  const { latest, audio } = renderPlayer(makeCatalogEntries(1));

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
  const { latest, audio } = renderPlayer(makeCatalogEntries(1));

  act(() => {
    media.dispatch(audio, 'error');
  });

  expect(latest.current!.errorKind).toBe('audioError');
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
  const entries = makeCatalogEntries(2);
  const { audio, rerender } = renderPlayer(entries);

  const loadCalls = media.load.mock.calls.length;

  rerender([...entries]);

  expect(media.load.mock.calls.length).toBe(loadCalls);
  expect(media.play).not.toHaveBeenCalled();
  expect(audio.getAttribute('src')).toBe('/_music-media/track-01.wav');
});

it('releases the source when the queue empties', () => {
  const { latest, audio, rerender } = renderPlayer(makeCatalogEntries(1));

  expect(audio.hasAttribute('src')).toBe(true);

  rerender([]);

  expect(audio.hasAttribute('src')).toBe(false);
  expect(latest.current!.state.status).toBe('idle');
  expect(latest.current!.errorKind).toBeNull();
});

it('routes pauseRequested to the audio element', () => {
  const { latest } = renderPlayer(makeCatalogEntries(1));

  act(() => {
    latest.current!.sendIntent({ type: 'pauseRequested' });
  });

  expect(media.pause).toHaveBeenCalled();
});

it('seeks through the element once a duration is known', () => {
  const { latest, audio } = renderPlayer(makeCatalogEntries(1));

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
  const { latest, audio } = renderPlayer(makeCatalogEntries(1));

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
  const { latest, onReloadCatalog } = renderPlayer(makeCatalogEntries(1));

  act(() => {
    latest.current!.reloadCatalog();
  });

  expect(onReloadCatalog).toHaveBeenCalledTimes(1);
});
