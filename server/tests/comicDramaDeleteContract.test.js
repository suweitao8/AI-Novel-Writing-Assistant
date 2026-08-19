const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 漫剧删除契约：DramaProject 对小说是软引用（sourceRef，无外键级联），
// 必须先清理 drama 侧数据再删除小说本体，否则分镜/配音/视频会留成孤儿。
// 该顺序由 HTTP 组合层保证，这里对路由与服务实现做静态契约校验。

const routesPath = path.join(__dirname, "../src/modules/drama/http/dramaRoutes.ts");
const servicePath = path.join(__dirname, "../src/services/drama/DramaProjectService.ts");

test("漫剧删除先清 drama 软引用数据，再删小说本体", () => {
  const routes = fs.readFileSync(routesPath, "utf8");
  const dramaCleanupIndex = routes.indexOf("deleteProjectsByNovelRef");
  const novelDeleteIndex = routes.indexOf("deleteNovel(novelId)");
  assert.ok(dramaCleanupIndex > -1, "删除端点应调用 dramaProjectService.deleteProjectsByNovelRef");
  assert.ok(novelDeleteIndex > dramaCleanupIndex, "小说删除必须发生在 drama 清理之后，否则留下孤儿分镜数据");
});

test("deleteProjectsByNovelRef 仅匹配 novel_import 内容源", () => {
  const service = fs.readFileSync(servicePath, "utf8");
  assert.match(
    service,
    /deleteMany\(\{\s*where:\s*\{\s*source:\s*"novel_import",\s*sourceRef:\s*novelId/ ,
  );
});
