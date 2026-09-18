import { listActiveMusicCatalog } from '@incept/db/music';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 音乐是公开内容，因此这条路由不做鉴权——它和 docs 的 guest/pro/private 阅读权限无关。
//
// trackKey 而不是 cuid 作为对外身份：契约要求内容变化时换用新的 trackKey，
// 因此它正好是队列需要的稳定标识，而数据库主键不承担这个语义。
//
// 曲库与归属由 listActiveMusicCatalog 一次取回：关联组装留在 db 边界，这里只做 JSON 序列化。
export async function GET() {
  const catalog = await listActiveMusicCatalog();

  return NextResponse.json({
    libraries: catalog.libraries.map((library) => ({
      key: library.key,
      title: library.title,
      position: library.position,
    })),
    tracks: catalog.tracks.map((track) => ({
      trackKey: track.trackKey,
      title: track.title,
      artist: track.artist,
      audioUrl: track.audioUrl,
      durationSeconds: track.durationSeconds,
      publishedAt: track.publishedAt ? track.publishedAt.toISOString() : null,
      libraries: track.libraries,
    })),
  });
}
