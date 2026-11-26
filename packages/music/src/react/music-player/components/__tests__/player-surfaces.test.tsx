import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { getPlayerCopy } from '../../adapter/player-copy';
import { PlayerCompact } from '../player-compact';
import { PlayerExpanded } from '../player-expanded';
import { PlayerOrb } from '../player-orb';

const noop = () => {};

const compactProps = {
  title: 'Fixture Song',
  clock: '0:02',
  totalClock: '0:15',
  rateLabel: '1x',
  playLabel: 'Play',
  pauseLabel: 'Pause',
  collapseLabel: 'Collapse player',
  expandListLabel: 'Expand playlist',
  collapseListLabel: 'Collapse playlist',
  rateCycleLabel: 'Playback speed',
  isPlaying: false,
  fullWidth: false,
  listExpanded: false,
  showOrbToggle: true,
  currentTime: 2,
  duration: 15,
  onTogglePlay: noop,
  onCollapse: noop,
  onToggleList: noop,
  onCycleRate: noop,
};

it('renders the orb as a pure icon without clock text and keeps it draggable', async () => {
  const onClick = vi.fn();
  const user = userEvent.setup();

  render(
    <PlayerOrb
      label="Expand player"
      title="Fixture Song"
      clock="0:02"
      totalClock="0:15"
      onClick={onClick}
      currentTime={2}
      duration={15}
      statusText="Audio failed to load"
    />,
  );

  const orb = screen.getByRole('button', { name: 'Expand player' });

  expect(orb).not.toHaveTextContent('0:02');
  expect(orb).not.toHaveAttribute('data-player-interactive');
  expect(orb).toHaveAttribute('title', 'Fixture Song · 0:02 / 0:15 · Audio failed to load');

  await user.click(orb);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('renders the compact pill with title, rate, list and orb toggles but no clock dial', () => {
  const { container } = render(<PlayerCompact {...compactProps} statusText="Audio failed to load" />);

  const title = screen.getByText('Fixture Song');

  expect(title.style.fontFamily).toBe('var(--font-stack-system, system-ui, sans-serif)');
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Playback speed 1x' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand playlist' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Collapse player' })).toBeInTheDocument();
  expect(screen.queryByText('0:02')).not.toBeInTheDocument();
  expect(container.querySelector('[title="Fixture Song · Audio failed to load"]')).not.toBeNull();
});

it('shows an inline status notice in the expanded card with retry and dismiss actions', async () => {
  const onRetryCatalog = vi.fn();
  const onDismissStatus = vi.fn();
  const user = userEvent.setup();
  const copy = getPlayerCopy('en');

  render(
    <PlayerExpanded
      copy={copy}
      heading="Playlist (1)"
      items={[]}
      title="Fixture Song"
      clock="0:02"
      totalClock="0:15"
      currentTime={2}
      duration={15}
      onSeek={noop}
      rateLabel="1x"
      rateCycleLabel="Playback speed"
      isPlaying={false}
      fullWidth
      showOrbToggle={false}
      libraries={[]}
      selectedLibrary={null}
      onSelectLibrary={noop}
      onTogglePlay={noop}
      onSelect={noop}
      onCollapse={noop}
      onCollapseList={noop}
      onCycleRate={noop}
      statusText="Track list failed to load"
      canRetryCatalog
      onRetryCatalog={onRetryCatalog}
      onDismissStatus={onDismissStatus}
    />,
  );

  const notice = screen.getByRole('status');

  expect(notice).toHaveTextContent('Track list failed to load');
  expect(screen.getByRole('heading', { name: 'Playlist (1)' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetryCatalog).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
  expect(onDismissStatus).toHaveBeenCalledTimes(1);
});
