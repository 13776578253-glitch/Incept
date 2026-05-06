import { PrismaClient } from "../generated/client/index.js";

declare global {
  var __inceptPrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__inceptPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inceptPrisma__ = prisma;
}
