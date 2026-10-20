import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MusicPlayerPreferencesProvider } from '../../preferences/music-player-preferences-provider';
import { installMediaElementMocks, type MediaElementMocks } from '../../../testing/media-element';
import { makeCatalogPayload } from '../../../testing/music-fixtures';

import { MusicPlayerRuntimeMount } from '../music-player-runtime-mount';
import { useMusicPlayerPreferences } from '../../preferences/use-music-player-preferences';
import { act } from '@testing-library/react';

const STORAGE_KEY = 'incept-music-player-preferences';

const DEFAULTS = {
  playbackRateLocked: true,
  rememberPlacement: true,
  playbackMode: 'off',
  selectedLibrary: null,
};

let media: MediaElementMocks;

beforeEach(() => {
  media = installMediaElementMocks();
});

afterEach(() => {
  // 先卸载再还原桩：目录请求是异步落地的，卸载之后不能让未还原的调用打到真实 jsdom 实现上
  cleanup();
  media.restore();
  vi.restoreAllMocks();
});

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function storedPreferences() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

function renderMount() {
  return render(
    <MusicPlayerPreferencesProvider>
      <MusicPlayerRuntimeMount>
        <div />
      </MusicPlayerRuntimeMount>
    </MusicPlayerPreferencesProvider>,
  );
}

const payloadWithLibrary = makeCatalogPayload(
  { libraries: ['播客'] },
  { key: '播客', title: '播客' },
);

it('clears a stored library once the catalogue no longer offers it', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, selectedLibrary: '已删除' }));
  stubFetch(payloadWithLibrary);

  renderMount();

  await waitFor(() => expect(storedPreferences().selectedLibrary).toBeNull());
});

it('keeps a stored library that the catalogue still offers', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, selectedLibrary: '播客' }));
  stubFetch(payloadWithLibrary);

  renderMount();

  await waitFor(() => expect(storedPreferences().selectedLibrary).toBe('播客'));
});

it('does not touch the stored library before the catalogue has loaded', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, selectedLibrary: '播客' }));
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

  renderMount();

  // 初始的空数组不得被当成"这个库不存在"：清掉它会让用户偏好被目录加载时序悄悄覆盖
  await waitFor(() => expect(storedPreferences().selectedLibrary).toBe('播客'));
});

it('does not mount audio or request the catalog when the player is disabled', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, selectedLibrary: '播客', playerEnabled: false }));
  const fetch = stubFetch(payloadWithLibrary);
  const { container } = renderMount();
  await waitFor(() => expect(storedPreferences().playerEnabled).toBe(false));
  expect(container.querySelector('audio')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(storedPreferences().selectedLibrary).toBe('播客');
});

it('releases audio immediately on disable and preserves the page subtree', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, playerEnabled: true }));
  stubFetch(payloadWithLibrary);
  let toggle: (enabled: boolean) => void = () => {};
  function Page() {
    toggle = useMusicPlayerPreferences().setPlayerEnabled;
    return <input aria-label="draft" defaultValue="keep" />;
  }
  const { container, getByLabelText } = render(<MusicPlayerPreferencesProvider>
    <MusicPlayerRuntimeMount><Page /></MusicPlayerRuntimeMount>
  </MusicPlayerPreferencesProvider>);
  await waitFor(() => expect(container.querySelector('audio')).not.toBeNull());
  const input = getByLabelText('draft');
  const audio = container.querySelector('audio')!;
  const pause = vi.spyOn(audio, 'pause');
  act(() => toggle(false));
  expect(pause).toHaveBeenCalled();
  expect(container.querySelector('audio')).toBeNull();
  expect(getByLabelText('draft')).toBe(input);
});
