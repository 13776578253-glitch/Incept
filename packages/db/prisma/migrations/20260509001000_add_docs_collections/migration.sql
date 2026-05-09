-- CreateTable
CREATE TABLE "docs_collections" (
    "id" SERIAL NOT NULL,
    "accessRole" "DocAccessRole" NOT NULL DEFAULT 'guest',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docs_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docs_collection_locales" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docs_collection_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docs_collection_items" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docs_collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docs_collections_accessRole_idx" ON "docs_collections"("accessRole");

-- CreateIndex
CREATE INDEX "docs_collection_locales_locale_status_publishedAt_idx" ON "docs_collection_locales"("locale", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "docs_collection_locales_collectionId_locale_key" ON "docs_collection_locales"("collectionId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "docs_collection_locales_locale_slug_key" ON "docs_collection_locales"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "docs_collection_items_documentId_key" ON "docs_collection_items"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "docs_collection_items_collectionId_position_key" ON "docs_collection_items"("collectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "docs_collection_items_collectionId_documentId_key" ON "docs_collection_items"("collectionId", "documentId");

-- CreateIndex
CREATE INDEX "docs_collection_items_collectionId_idx" ON "docs_collection_items"("collectionId");

-- AddForeignKey
ALTER TABLE "docs_collections" ADD CONSTRAINT "docs_collections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs_collection_locales" ADD CONSTRAINT "docs_collection_locales_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "docs_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs_collection_items" ADD CONSTRAINT "docs_collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "docs_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs_collection_items" ADD CONSTRAINT "docs_collection_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "docs_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
