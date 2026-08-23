-- 故事资产状态图片不可变制品表；只新增表和索引，不覆盖或删除 legacy 文件。
CREATE TABLE "StoryAssetImageArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'staging',
    "activeLockKey" TEXT,
    "leaseExpiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mimeType" TEXT,
    "extension" TEXT,
    "sha256" TEXT,
    "byteSize" INTEGER,
    "sourceArtifactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryAssetImageArtifact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoryAssetImageArtifact_storageKey_key" ON "StoryAssetImageArtifact"("storageKey");
CREATE UNIQUE INDEX "StoryAssetImageArtifact_activeLockKey_key" ON "StoryAssetImageArtifact"("activeLockKey");
CREATE INDEX "StoryAssetImageArtifact_novelId_kind_assetId_stateId_idx" ON "StoryAssetImageArtifact"("novelId", "kind", "assetId", "stateId");
CREATE INDEX "StoryAssetImageArtifact_novelId_status_idx" ON "StoryAssetImageArtifact"("novelId", "status");
