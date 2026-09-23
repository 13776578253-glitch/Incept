import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { makeCatalogPayload, validCatalogTrack } from '../../../../testing/music-fixtures';

import { useMusicTrackCatalog } from '../use-music-track-catalog';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads the catalogue and reports ready', async () => {
  const fetchMock = stubFetch(async () => jsonResponse(makeCatalogPayload()));

  const { result } = renderHook(() => useMusicTrackCatalog());

  expect(result.current.status).toBe('loading');

  await waitFor(() => expect(result.current.status).toBe('ready'));

  expect(result.current.entries.map((entry) => entry.track.id)).toEqual(['demo-01']);
  expect(result.current.libraries).toEqual([{ key: 'default', title: 'default', position: 1 }]);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/music/tracks',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it('reports error when the request fails', async () => {
  stubFetch(async () => new Response('nope', { status: 500 }));
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));

  expect(result.current.entries).toEqual([]);
  expect(consoleError).toHaveBeenCalled();
});

it('reports error when the body is not JSON', async () => {
  stubFetch(async () => new Response('not json', { status: 200 }));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));
});

it('reports error when the payload fails validation', async () => {
  stubFetch(async () => jsonResponse(makeCatalogPayload({ audioUrl: 'http://evil.test/a.wav' })));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));
});

it('reports error when a track refers to an undeclared library', async () => {
  stubFetch(async () => jsonResponse(makeCatalogPayload({ libraries: ['missing'] })));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.libraries).toEqual([]);
});

it('returns to loading on reload and swaps in the new entries', async () => {
  const secondCall = deferred<Response>();
  let call = 0;

  stubFetch(async () => {
    call += 1;

    return call === 1 ? jsonResponse(makeCatalogPayload()) : secondCall.promise;
  });

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));

  act(() => {
    result.current.reload();
  });

  expect(result.current.status).toBe('loading');
  expect(result.current.entries).toHaveLength(1);

  await act(async () => {
    secondCall.resolve(
      jsonResponse({
        libraries: [{ key: 'default', title: 'default', position: 1 }],
        tracks: [
          {
            ...validCatalogTrack,
            trackKey: 'demo-02',
            audioUrl: '/_music-media/track-02.wav',
            libraries: ['default'],
          },
        ],
      }),
    );
  });

  expect(result.current.status).toBe('ready');
  expect(result.current.entries.map((entry) => entry.track.id)).toEqual(['demo-02']);
});

it('keeps the previous entries when a reload fails', async () => {
  let call = 0;

  stubFetch(async () => {
    call += 1;

    return call === 1 ? jsonResponse(makeCatalogPayload()) : new Response('nope', { status: 503 });
  });

  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { result } = renderHook(() => useMusicTrackCatalog());

  await waitFor(() => expect(result.current.status).toBe('ready'));

  act(() => {
    result.current.reload();
  });

  await waitFor(() => expect(result.current.status).toBe('error'));

  expect(result.current.entries.map((entry) => entry.track.id)).toEqual(['demo-01']);
});

it('aborts the in-flight request on unmount and stays silent', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let capturedSignal: AbortSignal | undefined;

  const fetchMock = stubFetch((_url, init) => {
    capturedSignal = init?.signal ?? undefined;

    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  });

  const { unmount } = renderHook(() => useMusicTrackCatalog());

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(capturedSignal?.aborted).toBe(false);

  unmount();

  expect(capturedSignal?.aborted).toBe(true);

  await act(async () => {
    await Promise.resolve();
  });

  expect(consoleError).not.toHaveBeenCalled();
});
