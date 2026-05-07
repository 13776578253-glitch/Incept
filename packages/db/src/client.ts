import { PrismaClient } from "../generated/client/index.js";

// 在开发环境中使用全局 PrismaClient 实例，避免频繁创建连接导致性能问题；在生产环境中正常创建实例
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
}

// 导出 PrismaClient 实例供其他模块使用
export const prisma =
  globalThis.__inceptPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inceptPrisma__ = prisma;
}
