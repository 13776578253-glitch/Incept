CREATE TYPE "DocsPublicationEventType" AS ENUM ('published', 'replaced');

CREATE TABLE "docs_publication_events" (
  "id" SERIAL NOT NULL,
  "documentId" INTEGER NOT NULL,
  "type" "DocsPublicationEventType" NOT NULL,
  "locale" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "writingUnits" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "docs_publication_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "docs_publication_events_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "docs_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "docs_publication_events_occurredAt_idx"
  ON "docs_publication_events"("occurredAt");

CREATE INDEX "docs_publication_events_documentId_occurredAt_idx"
  ON "docs_publication_events"("documentId", "occurredAt");

INSERT INTO "docs_publication_events" ("documentId", "type", "locale", "occurredAt", "writingUnits")
SELECT DISTINCT ON (locale_row."documentId")
  locale_row."documentId",
  'published'::"DocsPublicationEventType",
  locale_row."locale",
  locale_row."publishedAt",
  0
FROM "docs_document_locales" AS locale_row
WHERE locale_row."status" = 'published'::"DocStatus"
  AND locale_row."publishedAt" IS NOT NULL
ORDER BY locale_row."documentId", CASE WHEN locale_row."locale" = 'zh' THEN 0 ELSE 1 END, locale_row."publishedAt" ASC;
