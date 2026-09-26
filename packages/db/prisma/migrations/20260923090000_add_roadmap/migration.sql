-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('reviewing', 'unstarted', 'active', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "RoadmapEntryType" AS ENUM ('feature', 'improvement', 'maintenance');

-- CreateEnum
CREATE TYPE "RoadmapEntryPriority" AS ENUM ('high', 'middle', 'low', 'none');

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_columns" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "status" "RoadmapStatus" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "roadmap_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_entries" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "RoadmapStatus" NOT NULL,
    "type" "RoadmapEntryType" NOT NULL,
    "priority" "RoadmapEntryPriority" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "summaryZh" TEXT NOT NULL,
    "votes" INTEGER,
    "comments" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_entry_links" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "roadmap_entry_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_key_key" ON "roadmaps"("key");

-- CreateIndex
CREATE INDEX "roadmaps_position_idx" ON "roadmaps"("position");

-- CreateIndex
CREATE INDEX "roadmap_columns_roadmapId_position_idx" ON "roadmap_columns"("roadmapId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_columns_roadmapId_status_key" ON "roadmap_columns"("roadmapId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_entries_key_key" ON "roadmap_entries"("key");

-- CreateIndex
CREATE INDEX "roadmap_entries_roadmapId_status_position_idx" ON "roadmap_entries"("roadmapId", "status", "position");

-- CreateIndex
CREATE INDEX "roadmap_entry_links_entryId_position_idx" ON "roadmap_entry_links"("entryId", "position");

-- AddForeignKey
ALTER TABLE "roadmap_columns" ADD CONSTRAINT "roadmap_columns_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_entries" ADD CONSTRAINT "roadmap_entries_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_entry_links" ADD CONSTRAINT "roadmap_entry_links_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "roadmap_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
