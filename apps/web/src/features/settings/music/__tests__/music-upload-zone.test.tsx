import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { MusicAdminTrack } from '@/server/music/music-admin';

import { getMusicAdminCopy } from '../music-admin-copy';
import { MusicUploadZone } from '../music-upload-zone';

const { uploadMusicFile } = vi.hoisted(() => ({ uploadMusicFile: vi.fn() }));

vi.mock('../music-upload-client', () => ({ uploadMusicFile }));

const copy = getMusicAdminCopy('zh');
const library = { key: 'default', title: '默认', position: 1, isActive: true, memberCount: 0 };

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

function makeFile(name: string, relativePath?: string): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'audio/mpeg' });

  if (relativePath !== undefined) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  }

  return file;
}

function result(overrides: Record<string, unknown> = {}) {
  return { track, mediaStatus: 'published', trackStatus: 'created', duplicates: [], ...overrides };
}

function renderZone() {
  const ensureLibrary = vi.fn(async (name: string) => name);
  const onUploaded = vi.fn();

  const view = render(
    <MusicUploadZone
      copy={copy}
      libraries={[library]}
      selectedLibrary="default"
      onSelectLibrary={() => {}}
      ensureLibrary={ensureLibrary}
      onUploaded={onUploaded}
    />,
  );

  return { ensureLibrary, onUploaded, container: view.container };
}

afterEach(() => {
  vi.restoreAllMocks();
  uploadMusicFile.mockReset();
});

it('summarises the files it will not upload instead of dropping them silently', async () => {
  uploadMusicFile.mockResolvedValue(result());
  const user = userEvent.setup();

  renderZone();

  await user.upload(screen.getByLabelText('选择文件'), [
    makeFile('cover.jpg'),
    makeFile('lyrics.lrc'),
    makeFile('song.mp3'),
  ]);

  const summary = await screen.findByText(copy.formatUploadSkipped('cover.jpg', 2));

  expect(summary.tagName).toBe('SUMMARY');
  // 名单没有丢，只是收进了折叠里
  expect(screen.getByText('cover.jpg')).toBeInTheDocument();
  expect(screen.getByText('lyrics.lrc')).toBeInTheDocument();
  expect(uploadMusicFile).toHaveBeenCalledTimes(1);
  expect((uploadMusicFile.mock.calls[0][0] as File).name).toBe('song.mp3');
});

it('collapses a long list of skipped files into one summary line', async () => {
  uploadMusicFile.mockResolvedValue(result());
  const user = userEvent.setup();

  const { container } = renderZone();
  const extras = Array.from({ length: 30 }, (_, index) => makeFile(`extra-${index}.jpg`));

  await user.upload(screen.getByLabelText('选择文件'), [...extras, makeFile('song.mp3')]);

  await waitFor(() => expect(uploadMusicFile).toHaveBeenCalledTimes(1));

  const summary = screen.getByText(copy.formatUploadSkipped('extra-0.jpg', 30));

  // 300 个无关文件也只占一行：折叠着，明细可展开
  expect(summary.tagName).toBe('SUMMARY');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(container.querySelectorAll('details li')).toHaveLength(30);
});

it('creates a library only for the folders that actually carry audio', async () => {
  uploadMusicFile.mockResolvedValue(result());
  const { ensureLibrary } = renderZone();
  const user = userEvent.setup();

  await user.upload(screen.getByLabelText('选择文件夹'), [
    makeFile('song.mp3', '01-播客/song.mp3'),
    makeFile('cover.jpg', '02-图片/cover.jpg'),
  ]);

  await waitFor(() => expect(ensureLibrary).toHaveBeenCalledTimes(1));
  expect(ensureLibrary).toHaveBeenCalledWith('播客');
  expect(uploadMusicFile).toHaveBeenCalledTimes(1);
  // 纯图片目录不建库，但它的文件仍然看得见
  expect(screen.getByText('cover.jpg')).toBeInTheDocument();
});

it('leaves the libraries alone when a folder holds nothing but images', async () => {
  const { ensureLibrary } = renderZone();
  const user = userEvent.setup();

  await user.upload(screen.getByLabelText('选择文件夹'), [
    makeFile('cover.jpg', '01-图片/cover.jpg'),
    makeFile('info.txt', '01-图片/info.txt'),
  ]);

  await waitFor(() =>
    expect(screen.getByText(copy.formatUploadSkipped('cover.jpg', 2))).toBeInTheDocument(),
  );
  expect(ensureLibrary).not.toHaveBeenCalled();
  expect(uploadMusicFile).not.toHaveBeenCalled();
});

it('says which kind of success each file had', async () => {
  uploadMusicFile.mockImplementation(async (file: File) => {
    const table: Record<string, ReturnType<typeof result>> = {
      'new.mp3': result(),
      'reused.mp3': result({ mediaStatus: 'reused' }),
      'again.mp3': result({ mediaStatus: 'reused', trackStatus: 'existing' }),
      'elsewhere.mp3': result({ mediaStatus: 'reused', trackStatus: 'membership-added' }),
      'off.mp3': result({ mediaStatus: 'reused', trackStatus: 'deactivated' }),
      'similar.mp3': result({
        duplicates: [
          { trackKey: 'other', title: '别的版本', artist: null, durationSeconds: 10, reason: 'title-duration' },
        ],
      }),
    };

    return table[file.name];
  });
  const user = userEvent.setup();

  renderZone();

  await user.upload(screen.getByLabelText('选择文件'), [
    makeFile('new.mp3'),
    makeFile('reused.mp3'),
    makeFile('again.mp3'),
    makeFile('elsewhere.mp3'),
    makeFile('off.mp3'),
    makeFile('similar.mp3'),
  ]);

  await waitFor(() => expect(screen.getByText('已存在但已停用，请先恢复')).toBeInTheDocument());
  expect(screen.getByText('完成')).toBeInTheDocument();
  expect(screen.getByText('完成（复用已有文件）')).toBeInTheDocument();
  expect(screen.getByText('已存在，未新增')).toBeInTheDocument();
  expect(screen.getByText('已加入该曲库')).toBeInTheDocument();
  expect(screen.getByText('完成 · 疑似重复：《别的版本》')).toBeInTheDocument();
});

it('shows why a file failed without dropping the rest of the batch', async () => {
  uploadMusicFile.mockImplementation(async (file: File) => {
    if (file.name === 'broken.mp3') {
      throw new Error('The file is not MP3, WAV or FLAC audio.');
    }

    return result();
  });
  const user = userEvent.setup();

  const { onUploaded } = renderZone();

  await user.upload(screen.getByLabelText('选择文件'), [makeFile('broken.mp3'), makeFile('good.mp3')]);

  await waitFor(() =>
    expect(screen.getByText(/失败: The file is not MP3, WAV or FLAC audio\./u)).toBeInTheDocument(),
  );
  expect(uploadMusicFile).toHaveBeenCalledTimes(2);
  expect(onUploaded).toHaveBeenCalledTimes(1);
});
