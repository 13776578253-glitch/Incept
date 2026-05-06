-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('article', 'reference', 'note');

-- CreateEnum
CREATE TYPE "DocLayoutMode" AS ENUM ('sidebar', 'contentOnly');

-- CreateEnum
CREATE TYPE "DocAccessRole" AS ENUM ('guest', 'member', 'pro');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docs_documents" (
    "id" SERIAL NOT NULL,
    "kind" "DocKind" NOT NULL DEFAULT 'article',
    "layoutMode" "DocLayoutMode" NOT NULL DEFAULT 'contentOnly',
    "accessRole" "DocAccessRole" NOT NULL DEFAULT 'guest',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docs_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docs_document_locales" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "bodyJson" JSONB NOT NULL,
    "sidebarJson" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docs_document_locales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "docs_documents_kind_idx" ON "docs_documents"("kind");

-- CreateIndex
CREATE INDEX "docs_documents_layoutMode_idx" ON "docs_documents"("layoutMode");

-- CreateIndex
CREATE INDEX "docs_documents_accessRole_idx" ON "docs_documents"("accessRole");

-- CreateIndex
CREATE INDEX "docs_document_locales_locale_status_publishedAt_idx" ON "docs_document_locales"("locale", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "docs_document_locales_documentId_locale_key" ON "docs_document_locales"("documentId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "docs_document_locales_locale_slug_key" ON "docs_document_locales"("locale", "slug");

-- AddForeignKey
ALTER TABLE "docs_documents" ADD CONSTRAINT "docs_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docs_document_locales" ADD CONSTRAINT "docs_document_locales_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "docs_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
