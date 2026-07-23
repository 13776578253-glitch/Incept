-- AlterTable
ALTER TABLE "docs_collections" ADD COLUMN "collectionKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "docs_collections_collectionKey_key" ON "docs_collections"("collectionKey");
