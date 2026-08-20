-- 资产外观状态 + 章节提取结果持久化
ALTER TABLE "Character" ADD COLUMN "statesJson" TEXT;
ALTER TABLE "NovelScene" ADD COLUMN "statesJson" TEXT;
ALTER TABLE "NovelProp" ADD COLUMN "statesJson" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "referenceExtractionJson" TEXT;
