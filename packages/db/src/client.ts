import { PrismaClient } from "../generated/client/index.js";

// 全局 PrismaClient 
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
  var __inceptPrismaSchemaRevision__: string | undefined;
}

// Bump this when Prisma schema changes so Next development HMR does not retain a stale runtime model.
// TODO: This still reports the 2026-07-26 revision although the 2026-09-01 nested collection navigation and 2026-09-02 collection item active schema changes already landed; bump it when those models are accepted.
const prismaSchemaRevision = '2026-07-26-docs-listing';
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
