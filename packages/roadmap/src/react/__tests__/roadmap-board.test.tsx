// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { RoadmapEntry } from '../../domain';
import type { RoadmapBoard as RoadmapBoardData } from '../../ports';
import { createFixtureRoadmapRepository } from '../../testing';
import type { RoadmapChrome } from '../copy';
import { RoadmapBoard } from '../roadmap-board';
import { RoadmapSwitcher } from '../roadmap-switcher';
import { RoadmapToolbar } from '../roadmap-toolbar';

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

  it('preserves English column stage labels even in zh locale', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="zh" chrome={chrome} />);

    expect(screen.getByRole('region', { name: 'Backlog' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Next up' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'In Progress' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy();
  });

  it('shows both language titles and chips, with no interactive controls in the card', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} />);

    expect(screen.getByText('Interest-based reply method')).toBeTruthy();
    expect(screen.getByText('基于兴趣点的回复策略')).toBeTruthy();

    const card = screen.getByText('Interest-based reply method').closest('article') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText('Feature Request')).toBeTruthy();
    expect(within(card).getByText('Middle Priority')).toBeTruthy();
    expect(within(card).queryByRole('button')).toBeNull();
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

  it('opens the detail modal with Details/Activity feed/Editor tabs, interactive Board/Tags selectors, Backlog add button only inside modal, and Undo/Delete controls', async () => {
    render(<RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} />);

    expect(screen.queryByRole('button', { name: 'Add Backlog entry' })).toBeNull();

    const card = screen.getByText('Context compression').closest('article') as HTMLElement;
    fireEvent.click(card);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Context compression / 上下文压缩')).toBeTruthy();
    expect(within(dialog).getByText('View all similar requests')).toBeTruthy();
    expect(within(dialog).getByText('Details')).toBeTruthy();
    expect(within(dialog).getByText('Activity feed')).toBeTruthy();
    expect(within(dialog).getByText('Editor')).toBeTruthy();
    expect(within(dialog).getByText('Revert or delete')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(within(dialog).queryByText('Upvoters')).toBeNull();
    expect(within(dialog).queryByText('Comments')).toBeNull();
    expect(within(dialog).getByText('Author')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Add Backlog entry' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Select Board' }));
    expect(within(dialog).getByRole('listbox', { name: 'Board options' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('option', { name: /Improvement/i }).querySelector('button')!);
    expect(within(dialog).getByRole('button', { name: 'Select Board' }).textContent).toContain('Improvement');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Select Tags' }));
    expect(within(dialog).getByRole('listbox', { name: 'Tags options' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('option', { name: /High Priority/i }).querySelector('button')!);
    expect(within(dialog).getByRole('button', { name: 'Select Tags' }).textContent).toContain('High Priority');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Editor' }));
    expect(within(dialog).getByLabelText('Title')).toBeTruthy();
    expect(within(dialog).getByLabelText('Summary')).toBeTruthy();
    expect(within(dialog).getByLabelText('Detail')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous entry' }));
    expect(within(dialog).getByText('Runtime isolation groundwork / 运行时隔离地基')).toBeTruthy();

    fireEvent.click(dialog);
    const backlogCard = screen.getByText('Interest-based reply method').closest('article') as HTMLElement;
    fireEvent.click(backlogCard);
    const backlogDialog = screen.getByRole('dialog');
    expect(within(backlogDialog).getByRole('button', { name: 'Add Backlog entry' })).toBeTruthy();
    expect(within(backlogDialog).queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(within(backlogDialog).getByRole('button', { name: 'Delete' })).toBeTruthy();
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

    expect(screen.getByRole('link', { name: 'Roadmap' }).getAttribute('aria-current')).toBe(
      'true',
    );
    const second = screen.getByRole('link', { name: 'Atlas Board' });
    expect(second.getAttribute('href')).toBe('/en/atlas/roadmap?rd=sample-atlas');
    expect(second.getAttribute('aria-current')).toBeNull();
  });
});

describe('RoadmapToolbar', () => {
  it('renders the import button and project dropdown selector sequentially', async () => {
    const repository = createFixtureRoadmapRepository();
    const roadmaps = await repository.listRoadmaps();

    render(
      <RoadmapToolbar
        roadmaps={roadmaps}
        currentKey={roadmaps[0].key}
        locale="zh"
        importLabel="导入"
        projectSelectLabel="选择项目"
        allProjectsLabel="全部项目"
      />,
    );

    expect(screen.getByRole('button', { name: '导入' })).toBeTruthy();
    const trigger = screen.getByRole('button', { name: '选择项目' });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: '选择项目' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: '路线图' }));
    expect(screen.getByRole('button', { name: '路线图' })).toBeTruthy();
  });
});

