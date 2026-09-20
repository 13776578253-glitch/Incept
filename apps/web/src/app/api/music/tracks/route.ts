import { listActiveMusicCatalog } from '@incept/db/music';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
trackKey 作为对外身份：内容变化时换用新的 trackKey，是队列稳定标识，数据库主键不承担此语义
曲库与归属由 listActiveMusicCatalog 一次取回：关联组装留在 db 边界，这里做 JSON 序列化
*/

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
