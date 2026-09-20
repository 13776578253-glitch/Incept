import { createMusicTrack, listAllMusicLibraries, listAllMusicTracks } from '@incept/db/music';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import { storeMusicUpload } from '@/server/music/media-store';
import { readUploadedAudioMetadata, trackKeyForUpload } from '@/server/music/music-admin';
import { titleFromFileName } from '@/server/music/music-key';

export const runtime = 'nodejs';

/*
一个请求一个文件，请求体就是原始字节：不把 128 MB 读进内存
文件名与目标曲库走查询参数，其余元数据从音频标签里读
*/
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const filename = url.searchParams.get('filename')?.trim() ?? '';
  const libraryKey = url.searchParams.get('library')?.trim() ?? '';

  if (filename === '' || libraryKey === '') {
    return NextResponse.json({ error: 'A filename and a library are required.' }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: 'The request carried no file.' }, { status: 400 });
  }

  try {
    const stored = await storeMusicUpload({ stream: request.body, filename });
    const metadata = await readUploadedAudioMetadata(stored.storedPath);
    const [tracks, libraries] = await Promise.all([listAllMusicTracks(), listAllMusicLibraries()]);

    const track = await createMusicTrack({
      trackKey: trackKeyForUpload(
        filename,
        tracks.map((existing) => existing.trackKey),
      ),
      title: metadata.title ?? titleFromFileName(filename),
      artist: metadata.artist,
      durationSeconds: metadata.durationSeconds,
      audioUrl: stored.targetUrl,
      contentHash: stored.hash,
      mimeType: stored.mimeType,
      fileSize: stored.size,
      libraryKeys: [libraryKey],
    });

    return NextResponse.json({ track, mediaStatus: stored.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The upload failed.' },
      { status: 400 },
    );
  }
}
