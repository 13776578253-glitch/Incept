import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { getPlayerCopy } from '../../adapter/player-copy';
import { PlayerExpanded } from '../player-expanded';

it('allows a known-duration seek and disables it before metadata arrives', () => {
  const onSeek = vi.fn(), noop = () => {};
  const props = { copy: getPlayerCopy('en'), heading: 'Playlist', items: [], title: 'Fixture', clock: '0:02', totalClock: '0:15',
    currentTime: 2, duration: 15, onSeek, rateLabel: '1x', rateCycleLabel: 'Playback speed', isPlaying: false,
    fullWidth: true, showOrbToggle: false, libraries: [], selectedLibrary: null, onSelectLibrary: noop,
    onTogglePlay: noop, onSelect: noop, onCollapse: noop, onCollapseList: noop, onCycleRate: noop };
  const { rerender } = render(<PlayerExpanded {...props} />);
  const slider = screen.getByRole('slider', { name: 'Playback position' });
  fireEvent.change(slider, { target: { value: '9.5' } });
  expect(onSeek).toHaveBeenCalledWith(9.5);
  expect(slider).toHaveAttribute('aria-valuetext', '0:02 / 0:15');
  rerender(<PlayerExpanded {...props} duration={0} />);
  expect(slider).toBeDisabled();
});
