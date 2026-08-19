import { prisma } from "../../../db/prisma";

/**
 * 批量统计一组小说的全文字数（各章正文去空白字符数求和）。
 * 口径与产品"字数"展示一致：content.replace(/\s+/g, "").length。
 * 列表场景单页最多几十本，走 findMany + 内存累加即可，
 * 不引入 raw SQL（保持 postgres/sqlite 双方言零负担）。
 */
export async function listNovelWordCountByNovelIds(novelIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const chapters = await prisma.chapter.findMany({
    where: { novelId: { in: uniqueIds } },
    select: { novelId: true, content: true },
  });
  const wordCountByNovelId = new Map<string, number>();
  for (const chapter of chapters) {
    if (!chapter.content) {
      continue;
    }
    const count = chapter.content.replace(/\s+/g, "").length;
    wordCountByNovelId.set(chapter.novelId, (wordCountByNovelId.get(chapter.novelId) ?? 0) + count);
  }
  return wordCountByNovelId;
}
