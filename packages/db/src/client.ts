import { PrismaClient } from "../generated/client/index.js";

// 全局 PrismaClient 
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
  var __inceptPrismaSchemaRevision__: string | undefined;
}

// Bump this when Prisma schema changes so Next development HMR does not retain a stale runtime model.
// history: bumped for add_music_track, which also covers the 2026-09-01 nested collection navigation
// and the 2026-09-02 collection item active changes that had landed without a bump (BACKLOG B-10).
// history: bumped again for add_music_libraries.
// history: bumped again for add_music_content_hash_key.
const prismaSchemaRevision = '2026-09-21-add-music-content-hash-key';
const hasCurrentPrismaClient =
  globalThis.__inceptPrisma__ &&
  globalThis.__inceptPrismaSchemaRevision__ === prismaSchemaRevision;

// 导出 PrismaClient
export const prisma =
  (hasCurrentPrismaClient ? globalThis.__inceptPrisma__ : undefined) ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inceptPrisma__ = prisma;
  globalThis.__inceptPrismaSchemaRevision__ = prismaSchemaRevision;
}
