-- 设定中心：地点场景与关键道具
CREATE TABLE "NovelScene" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "summary" TEXT,
  "significance" TEXT,
  "mapNodeId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NovelScene_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NovelProp" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "plotFunction" TEXT,
  "ownerCharacterId" TEXT,
  "importance" TEXT NOT NULL DEFAULT 'major',
  "firstAppearHint" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NovelProp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NovelScene_novelId_sortOrder_idx"
  ON "NovelScene"("novelId", "sortOrder");
CREATE INDEX "NovelProp_novelId_sortOrder_idx"
  ON "NovelProp"("novelId", "sortOrder");

ALTER TABLE "NovelScene" ADD CONSTRAINT "NovelScene_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NovelProp" ADD CONSTRAINT "NovelProp_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NovelSettingsWorld" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "premise" TEXT NOT NULL,
  "era" TEXT,
  "toneRulesJson" TEXT,
  "keySettingsJson" TEXT,
  "mapJson" TEXT,
  "source" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NovelSettingsWorld_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NovelSettingsWorld" ADD CONSTRAINT "NovelSettingsWorld_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
