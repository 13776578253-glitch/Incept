import { PrismaClient } from "../generated/client/index.js";

// Declare the global variable for the Prisma client
declare global {
  var __inceptPrisma__: PrismaClient | undefined;
}

// Initialize the Prisma client, reusing the global instance in development to prevent multiple connections
export const prisma =
  globalThis.__inceptPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inceptPrisma__ = prisma;
}
