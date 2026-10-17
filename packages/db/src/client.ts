import { PrismaClient } from "../generated/client/index.js";

// Keep the HMR cache local to this generated schema. Other workspace checkouts
// can load an older PrismaClient type in the same TypeScript program.
const prismaCache = globalThis as unknown as {
  __inceptPrisma__?: PrismaClient;
  __inceptPrismaSchemaRevision__?: string;
};

// schema 每次变化都要改：Next dev 的 HMR 会留住旧的运行时模型
const prismaSchemaRevision = '2026-10-17-sync-agent-jobs';
const hasCurrentPrismaClient =
  prismaCache.__inceptPrisma__ &&
  prismaCache.__inceptPrismaSchemaRevision__ === prismaSchemaRevision;

// 导出 PrismaClient
export const prisma =
  (hasCurrentPrismaClient ? prismaCache.__inceptPrisma__ : undefined) ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  prismaCache.__inceptPrisma__ = prisma;
  prismaCache.__inceptPrismaSchemaRevision__ = prismaSchemaRevision;
}
