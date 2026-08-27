const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(SERVER_ROOT, relativePath), "utf8");
}

test("selected chapter bridge rejects an empty saved script before project creation", async () => {
  const { ComicDramaStoryboardBridgeService } = require("../dist/services/drama/studio/ComicDramaStoryboardBridgeService.js");
  let projectLookupCount = 0;
  const bridge = new ComicDramaStoryboardBridgeService({
    prisma: {
      novel: { findUnique: async () => ({ id: "novel-1", title: "测试漫剧" }) },
      chapter: { findFirst: async () => ({ id: "chapter-1", order: 1, title: "第一章", expectation: "  " }) },
      dramaProject: {
        findFirst: async () => {
          projectLookupCount += 1;
          return null;
        },
      },
    },
    dramaProjectService: {
      createProject: async () => {
        throw new Error("should not create a project");
      },
      assembleSourceBundle: async () => undefined,
    },
    dramaStoryboardService: { generateStoryboard: async () => undefined },
  });

  await assert.rejects(
    () => bridge.generateStoryboardFromNovelChapter("novel-1", 1),
    /脚本|台本|内容/,
  );
  assert.equal(projectLookupCount, 0, "empty script must be rejected before project lookup/creation");
});

test("selected chapter bridge reuses the project and generates only the requested episode", async () => {
  const { ComicDramaStoryboardBridgeService } = require("../dist/services/drama/studio/ComicDramaStoryboardBridgeService.js");
  const calls = [];
  const episode = { id: "episode-2", projectId: "project-1", order: 2, title: "第二章", content: "镜头一：夜雨。" };
  const bridge = new ComicDramaStoryboardBridgeService({
    prisma: {
      novel: { findUnique: async () => ({ id: "novel-1", title: "测试漫剧" }) },
      chapter: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { novelId: "novel-1", order: 2 });
          return { id: "chapter-2", order: 2, title: "第二章", expectation: "镜头一：夜雨。" };
        },
      },
      dramaProject: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { source: "novel_import", sourceRef: "novel-1" });
          return { id: "project-1", title: "测试漫剧", visualStyle: "realistic" };
        },
      },
      dramaEpisode: {
        upsert: async ({ where, create, update }) => {
          calls.push({ kind: "episode.upsert", where, create, update });
          return episode;
        },
      },
    },
    dramaProjectService: {
      createProject: async () => {
        throw new Error("existing project should be reused");
      },
      assembleSourceBundle: async (projectId) => calls.push({ kind: "source.bundle", projectId }),
    },
    dramaStoryboardService: {
      generateStoryboard: async (projectId, order, options) => {
        calls.push({ kind: "storyboard.generate", projectId, order, options });
        return { id: "storyboard-2", episodeId: episode.id };
      },
    },
  });

  const result = await bridge.generateStoryboardFromNovelChapter("novel-1", 2, {
    provider: "codex",
    model: "gpt-5.6-luna",
    temperature: 0.2,
    visualStyle: "realistic",
  });

  assert.equal(result.projectId, "project-1");
  assert.equal(result.episodeOrder, 2);
  assert.deepEqual(result.storyboard, { id: "storyboard-2", episodeId: episode.id });
  assert.deepEqual(calls[0], { kind: "source.bundle", projectId: "project-1" });
  assert.deepEqual(calls[1], {
    kind: "episode.upsert",
    where: { projectId_order: { projectId: "project-1", order: 2 } },
    create: {
      projectId: "project-1",
      order: 2,
      title: "第二章",
      content: "镜头一：夜雨。",
      status: "scripted",
    },
    update: {
      title: "第二章",
      content: "镜头一：夜雨。",
      status: "scripted",
      qualityFlags: null,
    },
  });
  assert.deepEqual(calls[2], {
    kind: "storyboard.generate",
    projectId: "project-1",
    order: 2,
    options: { provider: "codex", model: "gpt-5.6-luna", temperature: 0.2 },
  });
});

test("selected chapter storyboard bridge route is registered", () => {
  const routesSource = readSource("src/modules/drama/http/dramaRoutes.ts");
  assert.match(routesSource, /ComicDramaStoryboardBridgeService|comicDramaStoryboardBridgeService/);
  assert.match(routesSource, /router\.post\(\s*"\/studio\/:novelId\/chapters\/:order\/storyboard"/);
  assert.match(routesSource, /visualStyle/);
});
