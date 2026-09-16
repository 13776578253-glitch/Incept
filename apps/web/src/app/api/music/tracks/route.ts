import { listActiveMusicTracks } from '@incept/db/music';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 音乐是公开内容，因此这条路由不做鉴权——它和 docs 的 guest/pro/private 阅读权限无关。
//
// trackKey 而不是 cuid 作为对外身份：契约要求内容变化时换用新的 trackKey，
// 因此它正好是队列需要的稳定标识，而数据库主键不承担这个语义。
export async function GET() {
  const rows = await listActiveMusicTracks();

  return NextResponse.json({
    tracks: rows.map((row) => ({
      trackKey: row.trackKey,
      title: row.title,
      artist: row.artist,
      audioUrl: row.audioUrl,
      durationSeconds: row.durationSeconds,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    })),
  });
}
