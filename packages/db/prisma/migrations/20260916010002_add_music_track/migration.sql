-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "audioUrl" TEXT NOT NULL,
    "contentHash" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "durationSeconds" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_tracks_trackKey_key" ON "music_tracks"("trackKey");

-- CreateIndex
CREATE INDEX "music_tracks_isActive_position_idx" ON "music_tracks"("isActive", "position");
