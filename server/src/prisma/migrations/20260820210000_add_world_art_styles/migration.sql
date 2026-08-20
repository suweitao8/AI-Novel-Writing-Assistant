-- 美术风格：小说级自定义风格列表 + 默认风格
ALTER TABLE "NovelSettingsWorld" ADD COLUMN "artStylesJson" TEXT;
ALTER TABLE "NovelSettingsWorld" ADD COLUMN "defaultArtStyle" TEXT;
