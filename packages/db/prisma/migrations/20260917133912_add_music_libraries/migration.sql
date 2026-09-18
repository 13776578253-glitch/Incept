-- CreateTable
CREATE TABLE "music_libraries" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_library_items" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_libraries_key_key" ON "music_libraries"("key");

-- CreateIndex
CREATE INDEX "music_libraries_isActive_position_idx" ON "music_libraries"("isActive", "position");

-- CreateIndex
CREATE INDEX "music_library_items_trackId_idx" ON "music_library_items"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "music_library_items_libraryId_trackId_key" ON "music_library_items"("libraryId", "trackId");

-- AddForeignKey
ALTER TABLE "music_library_items" ADD CONSTRAINT "music_library_items_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "music_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_library_items" ADD CONSTRAINT "music_library_items_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "music_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
