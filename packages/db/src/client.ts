import { PrismaClient } from "../generated/client/index.js";

// 全局 PrismaClient 
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
  var __inceptPrismaSchemaRevision__: string | undefined;
}

// Bump this when Prisma schema changes so Next development HMR does not retain a stale runtime model.
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
