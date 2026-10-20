import type { Prisma } from '../../generated/client/index.js';
import { prisma } from '../client';

export function findDocsImportConfirmation(draftId: string) {
  return prisma.docsImportConfirmation.findUnique({ where: { draftId } });
}

// Serialize confirmations of the same draft, and commit its receipt with the content.
export function confirmDocsImportDraft(draftId: string,
  write: (db: Prisma.TransactionClient) => Promise<{ documentId: number; redirectPath: string }>) {
  return prisma.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${draftId}))`;
    const previous = await db.docsImportConfirmation.findUnique({ where: { draftId } });
    if (previous) return previous;
    const result = await write(db);
    return db.docsImportConfirmation.create({ data: { draftId, ...result } });
  }, { timeout: 30_000 });
}
