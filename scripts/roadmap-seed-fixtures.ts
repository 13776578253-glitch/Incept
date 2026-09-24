// 用法: pnpm roadmap:seed
// 初始 Seed（主控授权）：把 @incept/roadmap/testing 的 fixture 双语数据幂等写入 roadmap 四表。
// 只写 roadmaps / roadmap_columns / roadmap_entries / roadmap_entry_links，不动其他表。
// 走 tsx + 动态 import 的脚本↔TS 共享通道（music 脚本同款）；写入前过 domain 全量校验。
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadEnvironment() {
  const envFilePath = path.join(projectRoot, 'apps', 'web', '.env.local');

  try {
    process.loadEnvFile(envFilePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function main() {
  loadEnvironment();

  const domain = await import(
    pathToFileURL(path.join(projectRoot, 'packages/roadmap/src/domain/index.ts')).href
  );
  const fixtures = await import(
    pathToFileURL(path.join(projectRoot, 'packages/roadmap/src/testing/fixtures.ts')).href
  );
  const db = await import(pathToFileURL(path.join(projectRoot, 'packages/db/src/index.ts')).href);

  const { prisma } = db;
  const { fixtureRoadmaps, fixtureEntries } = fixtures;

  for (const roadmap of fixtureRoadmaps) {
    domain.validateRoadmap(roadmap);
    domain.validateBoard(
      roadmap,
      fixtureEntries.filter((entry) => entry.roadmap === roadmap.key),
    );
  }

  const counts = { roadmaps: 0, columns: 0, entries: 0, links: 0 };

  for (const [roadmapIndex, roadmap] of fixtureRoadmaps.entries()) {
    const roadmapRow = await prisma.roadmap.upsert({
      where: { key: roadmap.key },
      create: {
        key: roadmap.key,
        nameEn: roadmap.name.en,
        nameZh: roadmap.name.zh,
        position: (roadmapIndex + 1) * 10,
      },
      update: {
        nameEn: roadmap.name.en,
        nameZh: roadmap.name.zh,
      },
    });
    counts.roadmaps += 1;

    for (const [columnIndex, column] of roadmap.columns.entries()) {
      await prisma.roadmapColumn.upsert({
        where: { roadmapId_status: { roadmapId: roadmapRow.id, status: column.status } },
        create: {
          roadmapId: roadmapRow.id,
          status: column.status,
          labelEn: column.label.en,
          labelZh: column.label.zh,
          position: (columnIndex + 1) * 10,
        },
        update: {
          labelEn: column.label.en,
          labelZh: column.label.zh,
        },
      });
      counts.columns += 1;
    }

    const entries = fixtureEntries
      .filter((entry) => entry.roadmap === roadmap.key)
      .sort((a, b) => a.order - b.order);

    for (const entry of entries) {
      const entryRow = await prisma.roadmapEntry.upsert({
        where: { key: entry.key },
        create: {
          roadmapId: roadmapRow.id,
          key: entry.key,
          status: entry.status,
          type: entry.type,
          priority: entry.priority,
          titleEn: entry.title.en,
          titleZh: entry.title.zh,
          summaryEn: entry.summary.en,
          summaryZh: entry.summary.zh,
          votes: entry.metrics?.votes ?? null,
          comments: entry.metrics?.comments ?? null,
          position: entry.order,
        },
        update: {
          status: entry.status,
          type: entry.type,
          priority: entry.priority,
          titleEn: entry.title.en,
          titleZh: entry.title.zh,
          summaryEn: entry.summary.en,
          summaryZh: entry.summary.zh,
          votes: entry.metrics?.votes ?? null,
          comments: entry.metrics?.comments ?? null,
          position: entry.order,
        },
      });
      counts.entries += 1;

      // 链接整体重写（幂等）：先清后写，位次即写入顺序
      await prisma.roadmapEntryLink.deleteMany({ where: { entryId: entryRow.id } });
      const links = entry.links ?? [];

      for (const [linkIndex, link] of links.entries()) {
        await prisma.roadmapEntryLink.create({
          data: {
            entryId: entryRow.id,
            labelEn: link.label.en,
            labelZh: link.label.zh,
            href: link.href,
            position: (linkIndex + 1) * 10,
          },
        });
        counts.links += 1;
      }
    }
  }

  console.log('roadmap seed complete');
  console.log(`  roadmaps: ${counts.roadmaps}`);
  console.log(`  columns:  ${counts.columns}`);
  console.log(`  entries:  ${counts.entries}`);
  console.log(`  links:    ${counts.links}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
