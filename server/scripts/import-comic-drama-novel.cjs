// 一次性导入脚本：把桌面上的《黑暗文明10.txt》（GB18030）导入为漫剧项目小说。
// 幂等：按标题+productionKind 查重，已存在则跳过。用法：
//   DATABASE_URL="file:D:/Github/AI-Novel-Writing-Assistant/server/dev.db" node scripts/import-comic-drama-novel.cjs
const fs = require("node:fs");
const path = require("node:path");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { PrismaClient } = require("@prisma/client");

const SOURCE = "C:/Users/su/Desktop/黑暗文明10.txt";
const NOVEL_TITLE = "黑暗文明";

function decodeGb18030(buffer) {
  // 先按 UTF-8 解码（出现替换符说明不是 UTF-8），失败再退 GB18030。
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }
  const iconv = (() => {
    try {
      return require("iconv-lite");
    } catch {
      return null;
    }
  })();
  if (iconv) {
    return iconv.decode(buffer, "gb18030");
  }
  return new TextDecoder("gb18030").decode(buffer);
}

function parseChapters(text) {
  const lines = text.split(/\r?\n/);
  const chapters = [];
  let current = null;
  const heading = /^第[0-9一二三四五六七八九十百千零两]+章\s*[:：]?\s*(.*)$/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = heading.exec(line);
    if (match) {
      if (current && current.body.join("").trim()) {
        chapters.push(current);
      }
      current = { title: line.replace(/\s+/g, " "), body: [] };
      continue;
    }
    if (current) {
      current.body.push(rawLine);
    }
  }
  if (current && current.body.join("").trim()) {
    chapters.push(current);
  }
  return chapters.map((chapter, index) => ({
    order: index + 1,
    title: chapter.title.length > 60 ? `第${index + 1}章` : chapter.title,
    content: chapter.body.join("\n").trim(),
  })).filter((chapter) => chapter.content.length > 50);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length).replace(/^\.\//, "")
    : databaseUrl;
  const adapter = new PrismaBetterSqlite3({ url: `file:${path.resolve(filePath)}` });
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.novel.findFirst({
      where: { title: NOVEL_TITLE, productionKind: "comic_drama" },
      select: { id: true },
    });
    if (existing) {
      console.log("novel already imported:", existing.id);
      return;
    }
    const buffer = fs.readFileSync(SOURCE);
    const text = decodeGb18030(buffer);
    const chapters = parseChapters(text);
    if (chapters.length === 0) {
      throw new Error("没有解析到章节，检查文件编码或章节标题格式。");
    }
    const totalChars = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);
    const novel = await prisma.novel.create({
      data: {
        title: NOVEL_TITLE,
        description: "末世重生题材测试小说：叶辰在丧尸横行的黑暗文明中挣扎求生。从现成小说导入，用于漫剧全链路（分镜/配音/视频）验证。",
        creationExperience: "simple",
        productionKind: "comic_drama",
        writingMode: "original",
        estimatedChapterCount: chapters.length,
        outlineStatus: "completed",
        projectStatus: "in_progress",
      },
    });
    for (const chapter of chapters) {
      await prisma.chapter.create({
        data: {
          novelId: novel.id,
          order: chapter.order,
          title: chapter.title,
          content: chapter.content,
          generationState: "approved",
          chapterStatus: "completed",
        },
      });
    }
    console.log(JSON.stringify({ novelId: novel.id, chapters: chapters.length, totalChars }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
