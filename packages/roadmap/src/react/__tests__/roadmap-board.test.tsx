// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { RoadmapEntry } from '../../domain';
import type { RoadmapBoard as RoadmapBoardData } from '../../ports';
import { createFixtureRoadmapRepository } from '../../testing';
import type { RoadmapChrome } from '../copy';
import { RoadmapBoard } from '../roadmap-board';
import { RoadmapSwitcher } from '../roadmap-switcher';

const chrome: RoadmapChrome = {
  switcherLabel: 'Roadmaps',
  boardLabel: 'Roadmap board',
  lanePickerLabel: 'Choose a column',
  emptyLane: {
    reviewing: 'Nothing under review.',
    unstarted: 'Nothing queued.',
    active: 'Nothing in progress.',
    completed: 'Nothing shipped.',
    canceled: 'Nothing closed.',
  },
  loadMore: 'Load more',
  loading: 'Loading roadmap',
  errorTitle: 'This map could not be drawn',
  errorDescription: 'Something went wrong.',
  typeLabels: {
    feature: 'Feature Request',
    improvement: 'Improvement',
    maintenance: 'Maintenance',
  },
  priorityLabels: {
    high: 'High Priority',
    middle: 'Middle Priority',
    low: 'Low Priority',
    none: 'No Priority',
  },
  votesLabel: '{count} votes',
  commentsLabel: '{count} comments',
};

afterEach(cleanup);

async function sampleBoard(key: string): Promise<RoadmapBoardData> {
  const repository = createFixtureRoadmapRepository();
  const board = await repository.listBoard(key);

  if (!board) throw new Error(`missing fixture board ${key}`);
  return board;
}

describe('RoadmapBoard', () => {
  it('renders one lane per column with the board display names and counts', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} />);

    const lane = screen.getByRole('region', { name: 'Backlog' });
    expect(within(lane).getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy();
  });

  it('shows both language titles, chips and counts as text, never as buttons', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} />);

    expect(screen.getByText('Interest-based reply method')).toBeTruthy();
    expect(screen.getByText('基于兴趣点的回复策略')).toBeTruthy();

    const card = screen.getByText('Interest-based reply method').closest('article') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText('Feature Request')).toBeTruthy();
    expect(within(card).getByText('Middle Priority')).toBeTruthy();

    const votes = within(card).getByTitle('293 votes');
    expect(within(votes).getByText('293')).toBeTruthy();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /293/ })).toBeNull();
  });

  it('keeps the full long title available when the card clamps', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} />);

    const longTitle = screen.getByText(/deliberately long title/);
    expect(longTitle.getAttribute('title')).toMatch(/deliberately long title/);
  });

  it('teaches what an empty column holds', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-atlas')} locale="en" chrome={chrome} />);

    expect(screen.getByText('Nothing in progress.')).toBeTruthy();
  });

  it('paginates a crowded lane with Load more', async () => {
    const board = await sampleBoard('sample-roadmap');
    const base = board.entries[0];
    const crowded: RoadmapEntry[] = Array.from({ length: 12 }, (_, index) => ({
      ...(base as RoadmapEntry),
      key: `crowded-${index}`,
      order: index,
      status: 'reviewing',
    }));
    const data: RoadmapBoardData = {
      roadmap: {
        ...board.roadmap,
        columns: [{ status: 'reviewing', label: { en: 'Backlog', zh: '储备' } }],
      },
      entries: crowded,
    };

    render(<RoadmapBoard board={data} locale="en" chrome={chrome} />);
    expect(screen.getAllByRole('article')).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

describe('RoadmapSwitcher', () => {
  it('links every roadmap and marks the current one', async () => {
    const repository = createFixtureRoadmapRepository();
    const roadmaps = await repository.listRoadmaps();

    render(
      <RoadmapSwitcher
        roadmaps={roadmaps}
        currentKey={roadmaps[0].key}
        locale="en"
        hrefFor={(key) => `/en/atlas/roadmap?rd=${key}`}
        label="Roadmaps"
      />,
    );

    expect(screen.getByRole('link', { name: 'Sample Roadmap' }).getAttribute('aria-current')).toBe(
      'true',
    );
    const second = screen.getByRole('link', { name: 'Sample Atlas Board' });
    expect(second.getAttribute('href')).toBe('/en/atlas/roadmap?rd=sample-atlas');
    expect(second.getAttribute('aria-current')).toBeNull();
  });
});
