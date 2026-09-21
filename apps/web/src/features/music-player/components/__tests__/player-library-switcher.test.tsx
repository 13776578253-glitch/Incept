import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { getPlayerCopy } from '../../adapter/player-copy';
import { PlayerLibrarySwitcher } from '../player-library-switcher';

const libraries = [
  { key: '播客', title: '播客', position: 1 },
  { key: 'default', title: 'default', position: 2 },
];

it('renders the all view first, then every library', () => {
  render(
    <PlayerLibrarySwitcher
      copy={getPlayerCopy('zh')}
      libraries={libraries}
      selected={null}
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole('group', { name: '曲库' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '播客' })).toHaveAttribute('aria-pressed', 'false');
});

it('shows the localized label for the implicit default library', () => {
  render(
    <PlayerLibrarySwitcher
      copy={getPlayerCopy('zh')}
      libraries={libraries}
      selected="default"
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'default' })).not.toBeInTheDocument();
});

it('reports the selected key, and null for the all view', async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();

  render(
    <PlayerLibrarySwitcher
      copy={getPlayerCopy('zh')}
      libraries={libraries}
      selected={null}
      onSelect={onSelect}
    />,
  );

  await user.click(screen.getByRole('button', { name: '播客' }));

  expect(onSelect).toHaveBeenCalledWith('播客');

  await user.click(screen.getByRole('button', { name: '全部' }));

  expect(onSelect).toHaveBeenLastCalledWith(null);
});

it('renders the English copy', () => {
  render(
    <PlayerLibrarySwitcher
      copy={getPlayerCopy('en')}
      libraries={libraries}
      selected="default"
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole('group', { name: 'Libraries' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('aria-pressed', 'true');
});
