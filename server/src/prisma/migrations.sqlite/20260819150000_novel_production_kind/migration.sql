-- 漫剧项目标记：novel=普通小说，comic_drama=漫剧项目
ALTER TABLE "Novel" ADD COLUMN "productionKind" TEXT NOT NULL DEFAULT 'novel';
