import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
const pageSource = read("../src/pages/models/ModelLibraryPage.tsx");
const paginationSource = read("../src/pages/models/modelLibraryPagination.ts");
const paginationComponentSource = read("../src/pages/models/components/ModelLibraryPagination.tsx");

test("模型卡片缩略图输出最长边不超过 256px 并保持 4:3", () => {
  const match = thumbnailSource.match(
    /const THUMBNAIL_SIZE = \{ width: (\d+), height: (\d+) \} as const;/,
  );
  assert.ok(match, "缩略图必须声明固定输出尺寸");
  const width = Number(match[1]);
  const height = Number(match[2]);
  assert.ok(width <= 256 && height <= 256, `缩略图尺寸 ${width}x${height} 超过 256px 上限`);
  assert.deepEqual([width, height], [256, 192]);
  assert.equal(width / height, 4 / 3);
});

test("模型缩略图缓存版本与卡片异步解码合同已升级", () => {
  assert.match(thumbnailSource, /model-library:thumbnails:v28/);
  assert.doesNotMatch(thumbnailSource, /model-library:thumbnails:v26/);
  assert.doesNotMatch(thumbnailSource, /buildBlocking3dGroundGridLines|drawBlocking3dGroundGrid/);
  assert.match(pageSource, /loading="lazy"/);
  assert.match(pageSource, /decoding="async"/);
});

test("模型卡片只在视口附近才启动缩略图生成", () => {
  assert.match(pageSource, /useRef/);
  assert.match(pageSource, /IntersectionObserver/);
  assert.match(pageSource, /const MODEL_THUMBNAIL_ROOT_MARGIN = ["']320px 0px["']/);
  assert.match(pageSource, /rootMargin:\s*MODEL_THUMBNAIL_ROOT_MARGIN/);
  assert.match(pageSource, /ref=\{cardRef\}/);
  assert.doesNotMatch(
    pageSource,
    /useEffect\(\(\) => \{\s*if \(ensureThumbnail\(entry\)\) return;/,
  );
});

test("模型库只渲染当前分页并提供边界安全的分页控件", () => {
  assert.match(paginationSource, /MODEL_LIBRARY_PAGE_SIZE\s*=\s*50/);
  assert.match(pageSource, /getModelLibraryPage/);
  assert.match(pageSource, /getModelLibraryPage\(entries, page, MODEL_LIBRARY_PAGE_SIZE\)/);
  assert.match(pageSource, /pageEntries/);
  assert.match(paginationComponentSource, /data-model-pagination/);
  assert.match(paginationComponentSource, /第[\s\S]*页/);
});

test("模型库固定每行 10 个、每页 5 行，不随窗口尺寸改变", () => {
  assert.match(pageSource, /className="grid grid-cols-10 gap-2"/);
  assert.doesNotMatch(pageSource, /useModelLibraryPageSize/);
  assert.doesNotMatch(pageSource, /grid-cols-4|sm:grid-cols-6|lg:grid-cols-8|xl:grid-cols-10/);
  assert.doesNotMatch(paginationSource, /getModelLibraryPageSize|MODEL_LIBRARY_MAX_PAGE_ROWS/);
});

test("模型库筛选变化回到第一页并释放离页缩略图请求", () => {
  assert.match(pageSource, /setPage\(1\)/);
  assert.match(pageSource, /cancelThumbnail\(entry\.id\)/);
});

test("缩略图生成完成后安排合并持久化，不在队列循环中同步重写缓存", () => {
  assert.match(thumbnailSource, /scheduleCachePersist/);
  assert.match(thumbnailSource, /requestIdleCallback/);
  assert.doesNotMatch(
    thumbnailSource,
    /memoryCache\.set\(entry\.id, dataUrl\);\s*persistCache\(\)/,
  );
});
