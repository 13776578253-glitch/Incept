// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { auth, db } = vi.hoisted(() => ({
  auth: { role: 'owner' },
  db: { deleteMusicTrack: vi.fn(), updateMusicTrack: vi.fn() },
}));

vi.mock('@/server/auth', () => ({
  getCurrentViewer: async () => ({ role: auth.role }),
  hasSameOrigin: () => true,
}));

vi.mock('@incept/db/music', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@incept/db/music')>();

  return {
    ...actual,
    deleteMusicTrack: db.deleteMusicTrack,
    updateMusicTrack: db.updateMusicTrack,
  };
});

import { DELETE } from '../route';

const context = { params: Promise.resolve({ trackKey: 'demo-01' }) };

function request(): Request {
  return new Request('http://localhost/api/internal/music/tracks/demo-01', { method: 'DELETE' });
}

beforeEach(() => {
  auth.role = 'owner';
  db.deleteMusicTrack.mockResolvedValue({ trackKey: 'demo-01' });
});

afterEach(() => {
  vi.clearAllMocks();
});

// 永久删除只作用于数据库：镜像文件由清理入口在安全时机回收，接口不再报告也不执行任何媒体操作
it('removes the row and its memberships, reporting only the key', async () => {
  const response = await DELETE(request(), context);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ trackKey: 'demo-01' });
  expect(db.deleteMusicTrack).toHaveBeenCalledWith({ trackKey: 'demo-01' });
});

it('answers 404 to everyone who is not the owner', async () => {
  auth.role = 'guest';

  const response = await DELETE(request(), context);

  expect(response.status).toBe(404);
  expect(db.deleteMusicTrack).not.toHaveBeenCalled();
});

it('reports why a delete failed', async () => {
  db.deleteMusicTrack.mockRejectedValue(new Error('The track "demo-01" does not exist.'));

  const response = await DELETE(request(), context);

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: 'The track "demo-01" does not exist.',
  });
});
