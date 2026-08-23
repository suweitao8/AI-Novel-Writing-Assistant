PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DramaProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'original',
    "sourceRef" TEXT,
    "sourceInput" TEXT,
    "track" TEXT,
    "theme" TEXT,
    "orientation" TEXT NOT NULL DEFAULT 'horizontal_16_9',
    "targetEpisodes" INTEGER NOT NULL DEFAULT 80,
    "strategy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visualStyle" TEXT,
    "narratorVoiceData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_DramaProject" (
  "id", "title", "source", "sourceRef", "sourceInput", "track", "theme", "orientation",
  "targetEpisodes", "strategy", "status", "visualStyle", "narratorVoiceData", "createdAt", "updatedAt"
)
SELECT
  "id", "title", "source", "sourceRef", "sourceInput", "track", "theme", "orientation",
  "targetEpisodes", "strategy", "status", "visualStyle", "narratorVoiceData", "createdAt", "updatedAt"
FROM "DramaProject";

DROP TABLE "DramaProject";
ALTER TABLE "new_DramaProject" RENAME TO "DramaProject";

CREATE INDEX "DramaProject_source_idx" ON "DramaProject"("source");
CREATE INDEX "DramaProject_status_idx" ON "DramaProject"("status");

CREATE TABLE "new_DramaVideoPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "shotId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'prompted',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "providerTaskId" TEXT,
    "resultUrl" TEXT,
    "failureReason" TEXT,
    "providerResult" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaVideoPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DramaVideoPrompt_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_DramaVideoPrompt" (
  "id", "projectId", "episodeId", "shotId", "provider", "prompt", "negativePrompt", "aspectRatio",
  "durationSec", "status", "version", "supersededById", "providerTaskId", "resultUrl", "failureReason",
  "providerResult", "createdAt", "updatedAt"
)
SELECT
  "id", "projectId", "episodeId", "shotId", "provider", "prompt", "negativePrompt", "aspectRatio",
  "durationSec", "status", "version", "supersededById", "providerTaskId", "resultUrl", "failureReason",
  "providerResult", "createdAt", "updatedAt"
FROM "DramaVideoPrompt";

DROP TABLE "DramaVideoPrompt";
ALTER TABLE "new_DramaVideoPrompt" RENAME TO "DramaVideoPrompt";

CREATE INDEX "DramaVideoPrompt_projectId_idx" ON "DramaVideoPrompt"("projectId");
CREATE INDEX "DramaVideoPrompt_episodeId_idx" ON "DramaVideoPrompt"("episodeId");
CREATE INDEX "DramaVideoPrompt_provider_status_idx" ON "DramaVideoPrompt"("provider", "status");
CREATE INDEX "DramaVideoPrompt_projectId_shotId_version_idx" ON "DramaVideoPrompt"("projectId", "shotId", "version");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
