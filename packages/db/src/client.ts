import { PrismaClient } from "../generated/client/index.js";

// 在开发环境中使用全局 PrismaClient 实例，避免频繁创建连接导致性能问题；在生产环境中正常创建实例
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
  var __inceptPrismaSchemaRevision__: string | undefined;
}

// Bump this when Prisma schema changes so Next development HMR does not retain a stale runtime model.
const prismaSchemaRevision = '2026-07-26-docs-listing';
const hasCurrentPrismaClient =
  globalThis.__inceptPrisma__ &&
  globalThis.__inceptPrismaSchemaRevision__ === prismaSchemaRevision;

// 导出 PrismaClient 实例供其他模块使用
export const prisma =
  (hasCurrentPrismaClient ? globalThis.__inceptPrisma__ : undefined) ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inceptPrisma__ = prisma;
  globalThis.__inceptPrismaSchemaRevision__ = prismaSchemaRevision;
}
