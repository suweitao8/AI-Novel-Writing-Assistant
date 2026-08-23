const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
const workspaceHook = read("client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts");
const volumeSync = read("server/src/services/novel/volume/VolumeChapterSyncService.ts");

// 2026-08-23 数据丢失事故：漫剧第一章脚本（expectation）与参考文本（referenceText）
// 被反复清空——脚本被清成 19 个换行（编辑器空脚本占位符被自动保存写回），参考文本被
// 清成空串。两条守卫从根上堵住「空白值覆盖服务端已有内容」这一类丢失：
// ① 客户端：空白脚本/空白参考不得覆盖服务端非空内容（自动保存与冲保存共用 flush）；
// ② 服务端：卷章同步在规划摘要为空时不得覆写章节现有 expectation。
test("客户端冲保存守卫：空白脚本/参考文本不覆盖服务端已有内容", () => {
  assert.match(workspaceHook, /if \(!expectationText\.trim\(\) && \(currentChapter\.expectation \?\? ""\)\.trim\(\)\)/);
  assert.match(workspaceHook, /if \(!referenceText\.trim\(\) && \(currentChapter\.referenceText \?\? ""\)\.trim\(\)\)/);
});

test("卷章同步守卫：规划摘要为空时不覆写章节 expectation", () => {
  assert.match(volumeSync, /const planExpectation = item\.chapter\.purpose\?\.trim\(\) \|\| item\.chapter\.summary\?\.trim\(\) \|\| ""/);
  assert.match(volumeSync, /\.\.\.\(planExpectation \? \{ expectation: planExpectation \} : \{\}\)/);
  // 旧的无条件覆写不得回归（update 路径；create 路径给新章节带默认值不受此限）。
  assert.doesNotMatch(volumeSync, /order: item\.chapter\.chapterOrder,\s*\r?\n\s*expectation: item\.chapter\.purpose/);
});
