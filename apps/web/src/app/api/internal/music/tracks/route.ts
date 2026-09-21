import { createMusicTrack, listAllMusicLibraries, listAllMusicTracks } from '@incept/db/music';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import {
  readMusicUploadBytes,
  storeMusicAudioBytes,
  storeMusicUpload,
  type MusicUploadResult,
} from '@/server/music/media-store';
import { readUploadedAudioMetadata, trackKeyForUpload } from '@/server/music/music-admin';
import { titleFromFileName } from '@/server/music/music-key';
import { decodeNcmAudio, isNcmFileName } from '@/server/music/ncm-decode';

export const runtime = 'nodejs';

type StoredUpload = {
  stored: MusicUploadResult;
  // NCM 内嵌的元数据，优先于音频标签
  title: string | null;
  artist: string | null;
};

// .ncm 是加密容器：读到内存里解密成原始 mp3/flac 再入镜像，对外表现和直接上传音频完全一样：静默转换，界面上不需要任何开关
async function storeDecodedNcm(stream: ReadableStream<Uint8Array>): Promise<StoredUpload> {
  const bytes = await readMusicUploadBytes({ stream });
  const decoded = decodeNcmAudio(bytes);
  const stored = await storeMusicAudioBytes({
    bytes: decoded.audio,
    extension: `.${decoded.format}`,
  });

  return {
    stored,
    title: decoded.title,
    artist: decoded.artists.length > 0 ? decoded.artists.join(', ') : null,
  };
}

/*
一个请求一个文件，请求体就是原始字节：音频流式落盘，ncm 才整体读进内存解密
文件名与目标曲库走查询参数，其余元数据从 ncm 元数据或音频标签里读
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
    const upload = isNcmFileName(filename)
      ? await storeDecodedNcm(request.body)
      : {
          stored: await storeMusicUpload({ stream: request.body, filename }),
          title: null,
          artist: null,
        };
    const { stored } = upload;
    const metadata = await readUploadedAudioMetadata(stored.storedPath);
    const [tracks, libraries] = await Promise.all([listAllMusicTracks(), listAllMusicLibraries()]);

    const track = await createMusicTrack({
      trackKey: trackKeyForUpload(
        filename,
        tracks.map((existing) => existing.trackKey),
      ),
      title: upload.title ?? metadata.title ?? titleFromFileName(filename),
      artist: upload.artist ?? metadata.artist,
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
