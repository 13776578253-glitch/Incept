import { prisma } from '../client';
import { planMusicImport } from './plan';
import type { MusicImportSummary, MusicLibraryImportEntry, MusicTrackImportEntry } from './types';

// history：数据库部分是单事务的 / 镜像写入无法并入同一个事务（它是文件系统），但镜像按内容寻址、重复运行必然复用，所以"镜像已写、数据库失败"是可恢复的：重跑会复用同一批文件，只重做数据库这一步，并且 --validate 能查出落单的镜像
// 由 planMusicImport 决定（纯函数，两条模式的差异都在那里）；执行：曲目 → 曲库 → 成员关系 → 停用
export async function importMusicCatalog(input: {
  // null 表示清单没有声明曲库：旧清单模式
  libraries: MusicLibraryImportEntry[] | null;
  tracks: MusicTrackImportEntry[];
}): Promise<MusicImportSummary> {
  return prisma.$transaction(async (transaction) => {
    const [tracks, libraries, memberships] = await Promise.all([
      transaction.musicTrack.findMany({
        select: {
          id: true,
          trackKey: true,
          title: true,
          artist: true,
          audioUrl: true,
          contentHash: true,
          mimeType: true,
          fileSize: true,
          durationSeconds: true,
          publishedAt: true,
          position: true,
          isActive: true,
        },
      }),
      transaction.musicLibrary.findMany({
        select: { id: true, key: true, title: true, position: true, isActive: true },
      }),
      transaction.musicLibraryItem.findMany({ select: { libraryId: true, trackId: true } }),
    ]);

    const plan = planMusicImport({
      libraries: input.libraries,
      tracks: input.tracks,
      existing: { tracks, libraries, memberships },
    });

    for (const entry of plan.trackCreates) {
      await transaction.musicTrack.create({ data: { ...entry, isActive: true } });
    }

    for (const entry of plan.trackUpdates) {
      await transaction.musicTrack.update({
        where: { trackKey: entry.trackKey },
        data: { ...entry, isActive: true },
      });
    }

    if (plan.trackDeactivations.length > 0) {
      await transaction.musicTrack.updateMany({
        where: { trackKey: { in: plan.trackDeactivations }, isActive: true },
        data: { isActive: false },
      });
    }

    for (const entry of plan.libraryCreates) {
      await transaction.musicLibrary.create({ data: { ...entry, isActive: true } });
    }

    for (const entry of plan.libraryUpdates) {
      await transaction.musicLibrary.update({
        where: { key: entry.key },
        data: { title: entry.title, position: entry.position, isActive: true },
      });
    }

    if (plan.libraryDeactivations.length > 0) {
      await transaction.musicLibrary.updateMany({
        where: { key: { in: plan.libraryDeactivations }, isActive: true },
        data: { isActive: false },
      });
    }

    if (plan.membershipAdds.length > 0 || plan.membershipRemovals.length > 0) {
      const [libraryRows, trackRows] = await Promise.all([
        transaction.musicLibrary.findMany({ select: { id: true, key: true } }),
        transaction.musicTrack.findMany({ select: { id: true, trackKey: true } }),
      ]);

      const libraryIdByKey = new Map(libraryRows.map((row) => [row.key, row.id]));
      const trackIdByKey = new Map(trackRows.map((row) => [row.trackKey, row.id]));

      const resolvePairs = (pairs: Array<{ libraryKey: string; trackKey: string }>) =>
        pairs.map((pair) => {
          const libraryId = libraryIdByKey.get(pair.libraryKey);
          const trackId = trackIdByKey.get(pair.trackKey);

          // key 来自刚刚写入或读到的行；缺失说明调用方绕过了前置校验（这是导出的 DB API），静默过滤会让 summary 报出并未发生的写入
          if (!libraryId || !trackId) {
            throw new Error(
              `music import plan references an unknown ${libraryId ? 'track' : 'library'}: ${pair.libraryKey} / ${pair.trackKey}`,
            );
          }

          return { libraryId, trackId };
        });

      const removals = resolvePairs(plan.membershipRemovals);

      if (removals.length > 0) {
        await transaction.musicLibraryItem.deleteMany({ where: { OR: removals } });
      }

      const additions = resolvePairs(plan.membershipAdds);

      if (additions.length > 0) {
        await transaction.musicLibraryItem.createMany({ data: additions });
      }
    }

    return plan.summary;
  });
}
