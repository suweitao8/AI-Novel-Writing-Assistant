import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const readShared = (relativePath) => readFileSync(new URL(`../../shared/${relativePath}`, import.meta.url), "utf8");

test("漫剧卡片预览图：合同、列表卡片与设定选择器的源码形态", () => {
  const sharedSource = readShared("types/comicDrama.ts");
  // 链接投影必须带预览场景选择与生效图片 URL 两个字段。
  assert.match(sharedSource, /previewSceneId: string \| null/);
  assert.match(sharedSource, /previewImageUrl: string \| null/);

  const listSource = read("pages/drama/comicDrama/ComicDramaListPage.tsx");
  // 卡片消费投影里的预览图，方形卡片内 object-cover 居中裁切 2:1 场景图。
  assert.match(listSource, /link\?\.previewImageUrl/);
  assert.match(listSource, /object-cover/);
  // 无图回落文字面板，不能引入图片以外的自造视觉。
  assert.match(listSource, /CardContent className="flex h-full flex-col gap-2 p-3"/);

  const studioSource = read("pages/drama/comicDrama/ComicDramaStudioPage.tsx");
  // 设定 · 通用：预览场景选择器（默认第一个有图的场景）+ 保存后刷新 overview。
  assert.match(studioSource, /updateDramaPreviewScene/);
  assert.match(studioSource, /默认（第一个有图的场景）/);
  assert.match(studioSource, /queryKeys\.comicDrama\.overview\(novelId\)/);
});
