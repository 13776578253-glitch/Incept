-- CreateTable
CREATE TABLE "roadmap_projects" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_projects_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "roadmaps" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_projects_key_key" ON "roadmap_projects"("key");
CREATE INDEX "roadmap_projects_position_idx" ON "roadmap_projects"("position");
CREATE INDEX "roadmaps_projectId_idx" ON "roadmaps"("projectId");

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "roadmap_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
