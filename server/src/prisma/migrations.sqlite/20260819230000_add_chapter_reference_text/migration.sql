-- 漫剧工作室「参考」页签：每章参考小说正文（服务端持久化，替代浏览器 localStorage）
ALTER TABLE "Chapter" ADD COLUMN "referenceText" TEXT;
