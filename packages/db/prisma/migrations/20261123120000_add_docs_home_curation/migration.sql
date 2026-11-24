ALTER TABLE "docs_documents"
ADD COLUMN "isCurated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "docs_documents_isCurated_idx" ON "docs_documents"("isCurated");

ALTER TABLE "docs_collections"
ADD COLUMN "isCurated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "docs_collections_isCurated_idx" ON "docs_collections"("isCurated");
