-- 场景时间与天气（影响场景图的光线与氛围）
ALTER TABLE "NovelScene" ADD COLUMN "timeOfDay" TEXT;
ALTER TABLE "NovelScene" ADD COLUMN "weather" TEXT;
