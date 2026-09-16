import { prisma } from '../client';
import type { MusicImportSummary, MusicTrackImportEntry } from './types';

// 数据库部分是单事务的。镜像写入无法并入同一个事务（它是文件系统），
// 但镜像按内容寻址、重复运行必然复用，所以"镜像已写、数据库失败"是可恢复的：
// 重跑会复用同一批文件，只重做数据库这一步，并且 --validate 能查出落单的镜像。
export async function importMusicTracks(
  entries: MusicTrackImportEntry[],
): Promise<MusicImportSummary> {
  const summary: MusicImportSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deactivated: 0,
    warnings: [],
  };

  await prisma.$transaction(async (transaction) => {
    const existingRows = await transaction.musicTrack.findMany({
      select: {
        trackKey: true,
        title: true,
        artist: true,
        audioUrl: true,
        contentHash: true,
        mimeType: true,
        fileSize: true,
        publishedAt: true,
        position: true,
        isActive: true,
      },
    });

    const existingByKey = new Map(existingRows.map((row) => [row.trackKey, row]));
    const manifestKeys = new Set<string>();

    for (const entry of entries) {
      manifestKeys.add(entry.trackKey);

      const current = existingByKey.get(entry.trackKey);

      if (!current) {
        await transaction.musicTrack.create({
          data: { ...entry, isActive: true },
        });
        summary.created += 1;
        continue;
      }

      // 契约要求内容变化时换用新的 trackKey。此处不阻断导入（重新编码是合法操作），
      // 只记录警告，使契约被违反这件事可见。
      if (current.contentHash && current.contentHash !== entry.contentHash) {
        summary.warnings.push(
          `content changed under an unchanged trackKey "${entry.trackKey}"; the contract is to issue a new trackKey`,
        );
      }

      const changed =
        current.title !== entry.title ||
        current.artist !== entry.artist ||
        current.audioUrl !== entry.audioUrl ||
        current.contentHash !== entry.contentHash ||
        current.mimeType !== entry.mimeType ||
        current.fileSize !== entry.fileSize ||
        (current.publishedAt?.getTime() ?? null) !== (entry.publishedAt?.getTime() ?? null) ||
        current.position !== entry.position ||
        !current.isActive;

      if (!changed) {
        summary.unchanged += 1;
        continue;
      }

      await transaction.musicTrack.update({
        where: { trackKey: entry.trackKey },
        data: { ...entry, isActive: true },
      });
      summary.updated += 1;
    }

    // 从清单里消失的曲目只是停用，不删除：行和镜像都保留，历史可追溯
    const staleKeys = existingRows
      .filter((row) => row.isActive && !manifestKeys.has(row.trackKey))
      .map((row) => row.trackKey);

    if (staleKeys.length > 0) {
      await transaction.musicTrack.updateMany({
        where: { trackKey: { in: staleKeys } },
        data: { isActive: false },
      });
      summary.deactivated = staleKeys.length;
    }
  });

  return summary;
}
