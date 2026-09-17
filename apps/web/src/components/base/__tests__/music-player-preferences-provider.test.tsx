import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useMusicPlayerPreferences } from '@/hooks/use-music-player-preferences';

import {
  MusicPlayerPreferencesProvider,
  type MusicPlayerPreferencesValue,
} from '../music-player-preferences-provider';

const STORAGE_KEY = 'incept-music-player-preferences';

const DEFAULT_PREFERENCES = {
  playbackRateLocked: true,
  rememberPlacement: true,
  playbackMode: 'off',
};

function storedPreferences() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

function renderPreferences(
  options: {
    strict?: boolean;
    onValue?: (value: MusicPlayerPreferencesValue) => void;
  } = {},
) {
  const latest: { current: MusicPlayerPreferencesValue | null } = { current: null };

  function Probe() {
    const value = useMusicPlayerPreferences();
    latest.current = value;
    options.onValue?.(value);
    return null;
  }

  const tree = (
    <MusicPlayerPreferencesProvider>
      <Probe />
    </MusicPlayerPreferencesProvider>
  );

  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);

  return latest;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('starts from the documented defaults and writes them once ready', () => {
  const latest = renderPreferences();

  expect(latest.current).toMatchObject(DEFAULT_PREFERENCES);
  expect(latest.current!.isReady).toBe(true);
  expect(storedPreferences()).toEqual(DEFAULT_PREFERENCES);
});

it('exposes isReady=false on the first render and true once storage has been read', () => {
  const sequence: boolean[] = [];

  renderPreferences({ onValue: (value) => sequence.push(value.isReady) });

  expect(sequence[0]).toBe(false);

  const firstTrue = sequence.indexOf(true);

  expect(firstTrue).toBeGreaterThan(-1);
  expect(sequence.slice(firstTrue).every(Boolean)).toBe(true);
});

it('falls back per field when stored values are invalid', () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ playbackRateLocked: false, rememberPlacement: 'yes', playbackMode: 'one' }),
  );

  const latest = renderPreferences();

  expect(latest.current!.playbackRateLocked).toBe(false);
  expect(latest.current!.rememberPlacement).toBe(true);
  expect(latest.current!.playbackMode).toBe('one');
});

it('falls back to all defaults when storage is corrupt', () => {
  localStorage.setItem(STORAGE_KEY, '{ not json');

  const latest = renderPreferences();

  expect(latest.current).toMatchObject(DEFAULT_PREFERENCES);
  expect(storedPreferences()).toEqual(DEFAULT_PREFERENCES);
});

it('persists a changed preference', () => {
  const latest = renderPreferences();

  act(() => {
    latest.current!.setPlaybackMode('all');
  });

  expect(latest.current!.playbackMode).toBe('all');
  expect(storedPreferences()).toMatchObject({ playbackMode: 'all' });
});

it('does not overwrite stored preferences with defaults while hydrating', () => {
  const stored = { playbackRateLocked: false, rememberPlacement: false, playbackMode: 'shuffle' };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  const latest = renderPreferences({ strict: true });

  expect(latest.current).toMatchObject(stored);
  expect(storedPreferences()).toEqual(stored);
});

it('keeps working when storage writes fail', () => {
  const latest = renderPreferences();

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });

  expect(() => {
    act(() => {
      latest.current!.setPlaybackRateLocked(false);
    });
  }).not.toThrow();

  expect(latest.current!.playbackRateLocked).toBe(false);
});

it('throws when the hook is used outside the provider', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  function Orphan() {
    useMusicPlayerPreferences();
    return null;
  }

  expect(() => render(<Orphan />)).toThrow(/must be used inside MusicPlayerPreferencesProvider/u);
});
