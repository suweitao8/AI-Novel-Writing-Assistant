-- 设定资产参考图：场景 360° 全景 / 道具 45° 透视的生成状态 JSON
ALTER TABLE "NovelScene" ADD COLUMN "imageData" TEXT;
ALTER TABLE "NovelProp" ADD COLUMN "imageData" TEXT;
