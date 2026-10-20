import { PrismaClient } from "../generated/client/index.js";

// 全局 PrismaClient 
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
  var __inceptPrismaSchemaRevision__: string | undefined;
}

// schema 每次变化都要改：Next dev 的 HMR 会留住旧的运行时模型
const prismaSchemaRevision = '2026-10-14-owner-authentication';
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
