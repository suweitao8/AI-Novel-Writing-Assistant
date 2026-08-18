// 漫剧工作流契约测试：productionKind 隔离（小说列表默认不显示漫剧）、studio 投影路由接线、漫剧创建置位。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");
const CLIENT_ROOT = path.join(SERVER_ROOT, "..", "client");
const { comicDramaStudioService } = require("../dist/services/drama/studio/ComicDramaStudioService.js");

function readSource(relativePath) {
  return fs.readFileSync(path.join(SERVER_ROOT, relativePath), "utf8");
}

test("comic drama studio service resolves empty links without touching the database", async () => {
  const response = await comicDramaStudioService.getLinks([]);
  assert.deepEqual(response.links, {});
});

test("novel list excludes comic drama projects by default and supports explicit filtering", () => {
  const crudSource = readSource("src/services/novel/novelCore/novelCoreCrudService.ts");
  assert.match(crudSource, /productionKind: productionKind \?\? "novel"/);
  const sharedSource = readSource("src/modules/novel/setup/http/novelBaseRoutes.ts");
  assert.match(sharedSource, /productionKind: z\.enum\(\["novel", "comic_drama"\]\)\.optional\(\)/);
});

test("create novel accepts productionKind and persists the comic drama marker", () => {
  const createSchemaSource = readSource("src/modules/novel/setup/http/novelBaseRoutes.ts");
  assert.match(createSchemaSource, /productionKind: z\.enum\(\["novel", "comic_drama"\]\)\.optional\(\),\n  narrativePov/);
  const crudSource = readSource("src/services/novel/novelCore/novelCoreCrudService.ts");
  assert.match(crudSource, /productionKind: input\.productionKind \?\? "novel"/);
});

test("drama studio projection routes are registered", () => {
  const routesSource = readSource("src/modules/drama/http/dramaRoutes.ts");
  assert.match(routesSource, /"\/studio\/links"/);
  assert.match(routesSource, /"\/studio\/:novelId\/overview"/);
});

test("comic drama client surfaces are wired (list, studio, sidebar, router)", () => {
  const routerSource = fs.readFileSync(path.join(CLIENT_ROOT, "src/router/index.tsx"), "utf8");
  assert.match(routerSource, /path: "drama", element: <ComicDramaListPage \/>/);
  assert.match(routerSource, /path: "drama\/studio\/:novelId"/);
  const sidebarSource = fs.readFileSync(path.join(CLIENT_ROOT, "src/components/layout/Sidebar.tsx"), "utf8");
  assert.match(sidebarSource, /to: "\/drama", label: "漫剧列表"/);
  const createDialogSource = fs.readFileSync(
    path.join(CLIENT_ROOT, "src/pages/drama/comicDrama/ComicDramaCreateDialog.tsx"),
    "utf8",
  );
  assert.match(createDialogSource, /productionKind: "comic_drama"/);
  assert.match(createDialogSource, /\/drama\/studio\/\$\{novelId\}/);
});
