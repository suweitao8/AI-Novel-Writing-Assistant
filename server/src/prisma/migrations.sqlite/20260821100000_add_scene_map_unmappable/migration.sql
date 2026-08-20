-- 场景地图标注：无法定位到地图的场景标记（AI 标注跳过，避免反复重试）
ALTER TABLE "NovelScene" ADD COLUMN "mapUnmappable" BOOLEAN NOT NULL DEFAULT false;
