import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { MusicAdminData, MusicAdminTrack } from '@/server/music/music-admin';

import { MusicAdminPanel } from '../music-admin-panel';

const { uploadMusicFile } = vi.hoisted(() => ({ uploadMusicFile: vi.fn() }));

vi.mock('../music-upload-client', () => ({ uploadMusicFile }));

const track: MusicAdminTrack = {
  trackKey: 'demo-01',
  title: '演示曲目 01',
  artist: null,
  durationSeconds: 268,
  publishedAt: null,
  libraries: ['default'],
  position: 1,
  isActive: true,
};

function adminData(overrides: Partial<MusicAdminData> = {}): MusicAdminData {
  return {
    status: 'ready',
    message: null,
    libraries: [
      { key: 'default', title: '默认', position: 1, isActive: true, memberCount: 1 },
      { key: '精选', title: '精选', position: 2, isActive: true, memberCount: 0 },
    ],
    tracks: [track],
    ...overrides,
  };
}

function stubFetch(status = 200, payload: unknown = {}) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status }),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body));
}

afterEach(() => {
  vi.restoreAllMocks();
  uploadMusicFile.mockReset();
});

it('renders the upload zone, the libraries and the tracks', () => {
  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  expect(screen.getByRole('heading', { name: '曲库与曲目管理' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '选择文件' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '选择文件夹' })).toBeInTheDocument();
  expect(screen.getByLabelText('曲库 default')).toHaveValue('默认');
  expect(screen.getByLabelText('曲目 demo-01')).toHaveValue('演示曲目 01');
  expect(screen.getByText('4:28')).toBeInTheDocument();
});

it('saves a renamed track through the tracks endpoint', async () => {
  const fetchMock = stubFetch(200, { track: { ...track, title: '新的名字' } });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const input = screen.getByLabelText('曲目 demo-01');
  await user.clear(input);
  await user.type(input, '新的名字');
  await user.click(screen.getByRole('button', { name: '保存' }));

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/internal/music/tracks/demo-01',
    expect.objectContaining({ method: 'PATCH' }),
  );
  expect(bodyOf(fetchMock)).toEqual({ title: '新的名字', artist: null });
  await waitFor(() => expect(screen.getByLabelText('曲目 demo-01')).toHaveValue('新的名字'));
});

it('toggles a library membership from the row chips', async () => {
  const fetchMock = stubFetch(200, { track: { ...track, libraries: ['default', '精选'] } });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const row = screen.getByLabelText('曲目 demo-01').closest('tr');

  if (!row) throw new Error('the track row is missing');

  await user.click(within(row).getByRole('button', { name: '精选' }));

  expect(bodyOf(fetchMock)).toEqual({ libraries: ['default', '精选'] });
});

it('deactivates a track without deleting it', async () => {
  const fetchMock = stubFetch(200, { track: { ...track, isActive: false } });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const row = screen.getByLabelText('曲目 demo-01').closest('tr');

  if (!row) throw new Error('the track row is missing');

  await user.click(within(row).getByRole('button', { name: '停用' }));

  expect(bodyOf(fetchMock)).toEqual({ isActive: false });
  await waitFor(() => expect(within(row).getByRole('button', { name: '恢复' })).toBeInTheDocument());
});

it('creates a library by name', async () => {
  const fetchMock = stubFetch(201, {
    library: { key: '播客', title: '播客', position: 3, isActive: true },
  });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  await user.type(screen.getByLabelText('新曲库名字'), '播客');
  await user.click(screen.getByRole('button', { name: '新建' }));

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/internal/music/libraries',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(bodyOf(fetchMock)).toEqual({ name: '播客' });
  await waitFor(() => expect(screen.getByLabelText('曲库 播客')).toHaveValue('播客'));
});

it('asks where the members go before deactivating a library', async () => {
  const fetchMock = stubFetch(200, {
    library: { key: 'default', title: '默认', position: 1, isActive: false },
  });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const libraryInput = screen.getByLabelText('曲库 default');
  const row = libraryInput.closest('li');

  if (!row) throw new Error('the library row is missing');

  await user.click(within(row).getByRole('button', { name: '停用' }));
  expect(fetchMock).not.toHaveBeenCalled();

  await user.selectOptions(screen.getByLabelText('成员移到 default'), '精选');
  await user.click(within(row).getByRole('button', { name: '停用' }));

  expect(bodyOf(fetchMock)).toEqual({ isActive: false, moveMembersTo: '精选' });
});

it('reports a failed request instead of silently keeping the edit', async () => {
  stubFetch(400, { error: 'A track title cannot be empty.' });
  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const input = screen.getByLabelText('曲目 demo-01');
  await user.clear(input);
  await user.type(input, '新名字');
  await user.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('A track title cannot be empty.'),
  );
});

it('uploads a file and adds the returned track to the table', async () => {
  const uploaded: MusicAdminTrack = {
    trackKey: 'uploaded-01',
    title: '上传曲目',
    artist: '标签作者',
    durationSeconds: 12,
    publishedAt: null,
    libraries: ['默认'],
    position: 2,
    isActive: true,
  };

  uploadMusicFile.mockResolvedValue({ track: uploaded, mediaStatus: 'publish' });

  const user = userEvent.setup();

  render(<MusicAdminPanel locale="zh" data={adminData()} />);

  const file = new File([new Uint8Array([1, 2, 3])], 'uploaded.mp3', { type: 'audio/mpeg' });

  await user.upload(screen.getByLabelText('选择文件'), file);

  await waitFor(() => expect(uploadMusicFile).toHaveBeenCalledTimes(1));
  expect(uploadMusicFile.mock.calls[0][1]).toBe('default');

  // 标题是输入框的值，不是文本节点
  await waitFor(() => expect(screen.getByLabelText('曲目 uploaded-01')).toHaveValue('上传曲目'));
});
