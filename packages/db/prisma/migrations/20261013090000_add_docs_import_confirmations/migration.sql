CREATE TABLE "docs_import_confirmations" (
  "draftId" TEXT NOT NULL,
  "documentId" INTEGER NOT NULL,
  "redirectPath" TEXT NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "docs_import_confirmations_pkey" PRIMARY KEY ("draftId")
);
