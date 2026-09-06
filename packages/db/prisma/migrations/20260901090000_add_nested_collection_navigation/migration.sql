-- Add folder/article navigation nodes while preserving existing collection articles.
CREATE TYPE "DocsCollectionItemType" AS ENUM ('article', 'folder');

ALTER TABLE "docs_collection_items"
  ADD COLUMN "parentId" INTEGER,
  ADD COLUMN "type" "DocsCollectionItemType" NOT NULL DEFAULT 'article',
  ADD COLUMN "nodeKey" TEXT;

UPDATE "docs_collection_items"
SET "nodeKey" = 'article-' || "documentId";

ALTER TABLE "docs_collection_items"
  ALTER COLUMN "documentId" DROP NOT NULL,
  ALTER COLUMN "nodeKey" SET NOT NULL;

DROP INDEX "docs_collection_items_collectionId_position_key";

ALTER TABLE "docs_collection_items"
  ADD CONSTRAINT "docs_collection_items_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "docs_collection_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "docs_collection_items_collectionId_nodeKey_key"
  ON "docs_collection_items"("collectionId", "nodeKey");

CREATE INDEX "docs_collection_items_collectionId_parentId_position_idx"
  ON "docs_collection_items"("collectionId", "parentId", "position");

CREATE TABLE "docs_collection_item_locales" (
  "id" SERIAL NOT NULL,
  "itemId" INTEGER NOT NULL,
  "locale" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "docs_collection_item_locales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "docs_collection_item_locales_itemId_locale_key"
  ON "docs_collection_item_locales"("itemId", "locale");

CREATE INDEX "docs_collection_item_locales_locale_idx"
  ON "docs_collection_item_locales"("locale");

ALTER TABLE "docs_collection_item_locales"
  ADD CONSTRAINT "docs_collection_item_locales_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "docs_collection_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
