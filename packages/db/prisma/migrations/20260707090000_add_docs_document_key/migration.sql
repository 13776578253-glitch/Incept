-- AlterTable
ALTER TABLE "docs_documents" ADD COLUMN "documentKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "docs_documents_documentKey_key" ON "docs_documents"("documentKey");
