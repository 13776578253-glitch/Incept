ALTER TABLE "docs_documents"
ADD COLUMN "isListed" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "docs_documents_isListed_idx" ON "docs_documents"("isListed");
