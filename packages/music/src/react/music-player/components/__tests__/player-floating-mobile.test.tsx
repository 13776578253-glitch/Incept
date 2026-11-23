import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayerFloating } from '../music-player-floating';

vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/docs',
}));

vi.mock('../../../preferences/use-music-player-preferences', () => ({
  useMusicPlayerPreferences: () => ({
    playbackRateLocked: true,
    rememberPlacement: false,
    playbackMode: 'off',
    selectedLibrary: null,
    setSelectedLibrary: vi.fn(),
    isReady: true,
  }),
}));

vi.mock('../../hooks/use-player-viewport', () => ({
  usePlayerViewport: () => ({
    mode: 'mobile',
    isReady: true,
  }),
}));

vi.mock('../../hooks/use-music-player', () => ({
  useMusicPlayer: () => ({
    state: {
      status: 'idle',
      currentTime: 0,
      duration: 180,
      playbackRate: 1,
      currentTrackId: 'track-1',
      queue: [{ id: 'track-1', title: 'Fixture Track', durationHint: 180 }],
    },
    sendIntent: vi.fn(),
    playTrack: vi.fn(),
    reloadCatalog: vi.fn(),
    currentTrack: { id: 'track-1', title: 'Fixture Track', durationHint: 180 },
    errorKind: null,
    catalog: [],
    libraries: [],
    catalogStatus: 'ready',
  }),
}));

describe('MusicPlayerFloating on mobile viewports', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults to the floating orb in the corner and allows toggling to compact and back to orb', async () => {
    const user = userEvent.setup();
    render(<MusicPlayerFloating locale="en" isHiddenRoute={() => false} />);

    const orb = screen.getByRole('button', { name: 'Expand player' });
    expect(orb).toBeInTheDocument();

    await user.click(orb);
    expect(screen.getByText('Fixture Track')).toBeInTheDocument();

    const collapseButton = screen.getByRole('button', { name: 'Collapse player' });
    await user.click(collapseButton);

    expect(screen.getByRole('button', { name: 'Expand player' })).toBeInTheDocument();
  });
});
