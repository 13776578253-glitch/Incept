// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  confirmDelete: 'Delete this proposal? This cannot be undone.',
  saveFailed: 'Save failed — changes were rolled back.',
  importSucceeded: 'Import complete.',
  importFailed: 'Import failed.',
  lastUpdated: 'Last updated',
  createdLabel: 'Created',
  pendingDetail: 'Pending specification',
  importLabel: 'Import',
  projectSelectLabel: 'Select project',
};

const zhChrome: RoadmapChrome = {
  ...chrome,
  importLabel: '导入',
  projectSelectLabel: '选择项目',
  importSucceeded: '导入完成。',
  importFailed: '导入失败。',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function sampleBoard(key: string): Promise<RoadmapBoardData> {
  const repository = createFixtureRoadmapRepository();
  const board = await repository.listBoard(key);

  if (!board) throw new Error(`missing fixture board ${key}`);
  return board;
}

// 请求桩：回显 body 合并结果（乐观更新 + 回写后的 entry 必须与 PATCH 后一致）。
function stubFetchEcho(base: RoadmapEntry) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    const entry: RoadmapEntry = {
      ...base,
      ...(body.status ? { status: body.status as RoadmapEntry['status'] } : {}),
      ...(body.type ? { type: body.type as RoadmapEntry['type'] } : {}),
      ...(body.priority ? { priority: body.priority as RoadmapEntry['priority'] } : {}),
      ...(body.title ? { title: body.title as RoadmapEntry['title'] } : {}),
      ...(body.summary ? { summary: body.summary as RoadmapEntry['summary'] } : {}),
      ...(body.detail ? { detail: body.detail as RoadmapEntry['detail'] } : {}),
    };
    const payload =
      method === 'DELETE'
        ? { key: entry.key }
        : String(input).endsWith('/import')
          ? { entries: [entry] }
          : { entry };

    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  });

  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('RoadmapBoard', () => {
  it('renders one lane per column with the board display names and counts', async () => {
    render(
      <RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} canEdit />,
    );

    const lane = screen.getByRole('region', { name: 'Backlog' });
    expect(within(lane).getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy();
  });

  it('preserves English column stage labels even in zh locale', async () => {
    render(
      <RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="zh" chrome={chrome} canEdit />,
    );

    expect(screen.getByRole('region', { name: 'Backlog' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Next up' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'In Progress' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy();
  });

  it('shows both language titles and chips, with no interactive controls in the card', async () => {
    render(
      <RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} canEdit />,
    );

    expect(screen.getByText('Interest-based reply method')).toBeTruthy();
    expect(screen.getByText('基于兴趣点的回复策略')).toBeTruthy();

    const card = screen.getByText('Interest-based reply method').closest('article') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText('Feature Request')).toBeTruthy();
    expect(within(card).getByText('Middle Priority')).toBeTruthy();
    expect(within(card).queryByRole('button')).toBeNull();
  });

  it('keeps the full long title available when the card clamps', async () => {
    render(
      <RoadmapBoard board={await sampleBoard('sample-roadmap')} locale="en" chrome={chrome} canEdit />,
    );

    const longTitle = screen.getByText(/deliberately long title/);
    expect(longTitle.getAttribute('title')).toMatch(/deliberately long title/);
  });

  it('teaches what an empty column holds', async () => {
    render(
      <RoadmapBoard board={await sampleBoard('sample-atlas')} locale="en" chrome={chrome} canEdit />,
    );

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

    render(<RoadmapBoard board={data} locale="en" chrome={chrome} canEdit />);
    expect(screen.getAllByRole('article')).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('opens the detail modal with Details/Activity feed/Editor tabs, interactive Board/Tags selectors, Backlog add button only inside modal, and Undo/Delete controls', async () => {
    const board = await sampleBoard('sample-roadmap');
    const contextEntry = board.entries.find(
      (item) => item.title.en === 'Context compression',
    ) as RoadmapEntry;

    stubFetchEcho(contextEntry);
    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit />);

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
    expect(within(backlogDialog).queryByText('Undo')).toBeNull();
    expect(within(backlogDialog).getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(within(backlogDialog).queryByText('View all similar requests')).toBeNull();
  });

  // M3 主证据：canEdit=false 时全部写控件不可见（非 Owner 门控 U2）。
  it('hides every write control for a non-owner visitor', async () => {
    const board = await sampleBoard('sample-roadmap');

    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit={false} />);

    const card = screen.getByText('Interest-based reply method').closest('article') as HTMLElement;
    fireEvent.click(card);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Editor')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Add Backlog entry' })).toBeNull();
    expect(within(dialog).queryByText('Revert or delete')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Select Board' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Select Tags' }).hasAttribute('disabled')).toBe(true);
  });

  // U1：Editor 保存按 ' / ' 拆双语，PATCH entry(key)。
  it('saves the editor with a split bilingual title via PATCH', async () => {
    const board = await sampleBoard('sample-roadmap');
    const entry = board.entries.find(
      (item) => item.title.en === 'Interest-based reply method',
    ) as RoadmapEntry;
    const spy = stubFetchEcho(entry);

    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit />);
    fireEvent.click(screen.getByText('Interest-based reply method').closest('article')!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Editor' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Hello / 你好' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as { title: RoadmapEntry['title'] };

    expect(String(url)).toContain('/api/internal/roadmap/entries/');
    expect(init?.method).toBe('PATCH');
    expect(body.title).toEqual({ en: 'Hello', zh: '你好' });
  });

  // Module C：Undo 回退一档（completed → active）。
  it('reverts one column back with Undo', async () => {
    const board = await sampleBoard('sample-roadmap');
    const entry = board.entries.find(
      (item) => item.title.en === 'Context compression',
    ) as RoadmapEntry;
    const spy = stubFetchEcho(entry);

    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit />);
    fireEvent.click(screen.getByText('Context compression').closest('article')!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo' }));

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as { status: string };

    expect(String(url)).toContain('/api/internal/roadmap/entries/');
    expect(body.status).toBe('active');
  });

  // U3：+ 进新建草稿态，Save 才 POST entries。
  it('enters a draft with + and only POSTs on Save', async () => {
    const board = await sampleBoard('sample-roadmap');
    const spy = stubFetchEcho({ ...board.entries[0], key: 'fresh-entry' });

    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit />);
    fireEvent.click(screen.getByText('Interest-based reply method').closest('article')!);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Backlog entry' }));

    expect(spy).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Title').getAttribute('value')).toBe('');

    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Fresh / 新' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      status: string;
      title: RoadmapEntry['title'];
    };

    expect(String(url)).toBe('/api/internal/roadmap/entries');
    expect(init?.method).toBe('POST');
    expect(body.status).toBe('reviewing');
    expect(body.title).toEqual({ en: 'Fresh', zh: '新' });
  });

  // Module D：Delete 确认后 DELETE entry(key)。
  it('deletes the proposal after confirm', async () => {
    const board = await sampleBoard('sample-roadmap');
    const entry = board.entries.find(
      (item) => item.title.en === 'Interest-based reply method',
    ) as RoadmapEntry;
    const spy = stubFetchEcho(entry);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RoadmapBoard board={board} locale="en" chrome={chrome} canEdit />);
    fireEvent.click(screen.getByText('Interest-based reply method').closest('article')!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];

    expect(String(url)).toContain('/api/internal/roadmap/entries/');
    expect(init?.method).toBe('DELETE');
    expect(confirmSpy).toHaveBeenCalledWith(chrome.confirmDelete);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    confirmSpy.mockRestore();
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

    const roadmapLinks = screen.getAllByRole('link', { name: 'Roadmap' });
    expect(roadmapLinks[0].getAttribute('aria-current')).toBe('true');
    const atlasLinks = screen.getAllByRole('link', { name: 'Atlas Board' });
    expect(atlasLinks[0].getAttribute('href')).toBe('/en/atlas/roadmap?rd=sample-atlas');
    expect(atlasLinks[0].getAttribute('aria-current')).toBeNull();
  });
});

describe('RoadmapToolbar', () => {
  // 右侧下拉切换项目；项目项是项目入口，与左侧的项目内板切换器分工。
  it('renders the import button and project dropdown as anchor navigation', async () => {
    const repository = createFixtureRoadmapRepository();
    const projects = await repository.listProjects();

    render(
      <RoadmapToolbar
        projects={projects}
        currentProjectKey={projects[0].key}
        locale="zh"
        chrome={zhChrome}
        canEdit
        hrefs={{
          'project-one': '/zh/atlas/roadmap?project=project-one',
          'project-two': '/zh/atlas/roadmap?project=project-two',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: '导入' })).toBeTruthy();
    // 右侧下拉展示项目名，选项指向项目内首板。
    const trigger = screen.getByRole('button', { name: '项目一' });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: '选择项目' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /项目二/ }).getAttribute('href')).toBe(
      '/zh/atlas/roadmap?project=project-two',
    );
    // 主控裁定：「全部项目」只是占位、路由语义错误，已移除——下拉是纯项目切换器。
    expect(screen.queryByRole('link', { name: '全部项目' })).toBeNull();
  });

  // U2：非 Owner 隐藏导入按钮；U5：选文件即 POST import。
  it('hides Import for non-owners and uploads a JSON manifest for the owner', async () => {
    const repository = createFixtureRoadmapRepository();
    const roadmaps = await repository.listRoadmaps();
    const projects = await repository.listProjects();
    const props = {
      projects,
      currentProjectKey: projects[0].key,
      locale: 'zh' as const,
      chrome: zhChrome,
      hrefs: {
        'project-one': '/zh/atlas/roadmap?project=project-one',
        'project-two': '/zh/atlas/roadmap?project=project-two',
      },
    };

    const anonymous = render(<RoadmapToolbar {...props} canEdit={false} />);
    expect(anonymous.queryByRole('button', { name: '导入' })).toBeNull();
    anonymous.unmount();

    const spy = stubFetchEcho({
      key: 'imported',
      roadmap: 'sample-roadmap',
      order: 10,
      status: 'reviewing',
      type: 'feature',
      priority: 'middle',
      title: { en: 'Imported', zh: '导入条目' },
      summary: { en: 'From manifest', zh: '来自清单' },
    });
    render(<RoadmapToolbar {...props} canEdit />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'manifest.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify({ entries: [] }),
    });

    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];

    expect(String(url)).toBe('/api/internal/roadmap/import');
    expect(init?.method).toBe('POST');
    expect(await screen.findByText('导入完成。')).toBeTruthy();
  });
});
