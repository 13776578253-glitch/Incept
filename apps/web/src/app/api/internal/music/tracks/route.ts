import path from 'node:path';

import { listAllMusicLibraries, uploadMusicTrack } from '@incept/music/adapters';
import { NextResponse } from 'next/server';

import { getCurrentViewer, hasSameOrigin } from '@/server/auth';
import {
  decodeNcmAudio,
  inspectUploadedAudio,
  isNcmDecodeError,
  isNcmFileName,
  musicAudioFormatExtensions,
  readMusicUploadBytes,
  storeMusicAudioBytes,
  storeMusicUpload,
  type MusicUploadResult,
  type NcmAudio,
  type UploadedAudioMetadata,
} from '@incept/music/adapters';
import {
  isMusicAudioExtension,
  musicAudioExtensionError,
  titleFromFileName,
  type MusicAudioExtension,
} from '@incept/music/domain';
import { webMusicMirrorDirectory } from '@/server/music/assembly';

export const runtime = 'nodejs';

type StoredUpload = {
  stored: MusicUploadResult;
  embeddedTitle: string | null;   // NCM 容器内嵌的元数据：优先于音频标签
  embeddedArtist: string | null;
  title: string | null;           // 音频标签/容器元数据缺失时用，不回退文件名
  artist: string | null;
  durationSeconds: number | null;
};

type InspectionHolder = { metadata: UploadedAudioMetadata | null };

// 普通音频与 NCM 解码结果共用的落盘前校验：返回真实格式，标签留给调用方
async function inspectStagedAudio(
  tempPath: string,
  holder: InspectionHolder,
): Promise<MusicAudioExtension> {
  const inspection = await inspectUploadedAudio(tempPath);

  if (!inspection.ok) {
    throw new Error(inspection.error);
  }

  holder.metadata = inspection;

  return musicAudioFormatExtensions[inspection.format];
}

function heldMetadata(holder: InspectionHolder): UploadedAudioMetadata {
  // 校验闭包在 store 返回之前跑过，这里把类型收窄
  if (holder.metadata === null) {
    throw new Error('The upload was not validated.');
  }

  return holder.metadata;
}

// 普通音频：流式落盘，落盘前先验真实格式
async function storePlainAudio(
  stream: ReadableStream<Uint8Array>,
  filename: string,
): Promise<StoredUpload> {
  const holder: InspectionHolder = { metadata: null };

  const stored = await storeMusicUpload({
    stream,
    filename,
    directory: webMusicMirrorDirectory(),
    resolveExtension: (tempPath) => inspectStagedAudio(tempPath, holder),
  });
  const metadata = heldMetadata(holder);

  return {
    stored,
    embeddedTitle: null,
    embeddedArtist: null,
    title: metadata.title,
    artist: metadata.artist,
    durationSeconds: metadata.durationSeconds,
  };
}

// NCM 解码结果：先在临时文件上解析，成功之后发布进镜像
async function storeDecodedAudio(decoded: NcmAudio): Promise<StoredUpload> {
  const holder: InspectionHolder = { metadata: null };

  const stored = await storeMusicAudioBytes({
    bytes: decoded.audio,
    extension: `.${decoded.format}`,
    directory: webMusicMirrorDirectory(),
    validate: async (tempPath) => {
      await inspectStagedAudio(tempPath, holder);
    },
  });
  const metadata = heldMetadata(holder);

  return {
    stored,
    embeddedTitle: decoded.title,
    embeddedArtist: decoded.artists.length > 0 ? decoded.artists.join(', ') : null,
    title: metadata.title,
    artist: metadata.artist,
    durationSeconds: metadata.durationSeconds,
  };
}

/*
一个请求一个文件：音频流式落盘，.ncm 整体读进内存解密
文件名与目标曲库走查询参数；去重只看解码后的字节哈希，命中就复用行、只补归属
发布之后才失败也不删镜像文件：回收只有 `pnpm music:cleanup` 一条路，`--validate` 只负责报告
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

  const isNcm = isNcmFileName(filename);
  const extension = path.extname(filename).toLowerCase();

  if (!isNcm && !isMusicAudioExtension(extension)) {
    return NextResponse.json({ error: musicAudioExtensionError(extension) }, { status: 400 });
  }

  const libraries = await listAllMusicLibraries();

  if (!libraries.some((library) => library.key === libraryKey && library.isActive)) {
    return NextResponse.json(
      { error: `The library "${libraryKey}" does not exist or is deactivated.` },
      { status: 400 },
    );
  }

  let upload: StoredUpload;

  try {
    if (isNcm) {
      // .ncm：读到内存解密成原始 mp3/flac，再走与普通音频同一套入镜像流程
      const bytes = await readMusicUploadBytes({ stream: request.body });

      upload = await storeDecodedAudio(decodeNcmAudio(bytes));
    } else {
      upload = await storePlainAudio(request.body, filename);
    }

    const { stored } = upload;
    const outcome = await uploadMusicTrack({
      filename,
      title: upload.embeddedTitle ?? upload.title ?? titleFromFileName(filename),
      artist: upload.embeddedArtist ?? upload.artist,
      durationSeconds: upload.durationSeconds,
      audioUrl: stored.targetUrl,
      contentHash: stored.hash,
      mimeType: stored.mimeType,
      fileSize: stored.size,
      libraryKeys: [libraryKey],
    });

    return NextResponse.json(
      {
        track: outcome.track,
        mediaStatus: stored.status === 'reuse' ? 'reused' : 'published',
        trackStatus: outcome.status,
        duplicates: outcome.duplicates,
      },
      { status: outcome.status === 'created' ? 201 : 200 },
    );
  } catch (error) {
    if (isNcmDecodeError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The upload failed.' },
      { status: 400 },
    );
  }
}
