const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
const sharedTypes = read("shared/types/novelReferenceExtraction.ts");
const extractStage = read("client/src/pages/drama/comicDrama/hooks/useReferenceExtractStage.ts");
const draftStage = read("client/src/pages/drama/comicDrama/hooks/useReferenceDraftStage.ts");
const studioPage = read("client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx");

// 2026-08-23 用户要求：漫剧「参考」页签的「解析」要能看见耗时——进行中实时计秒、
// 完成后显示「上次解析」用时。耗时随提取结果持久化（ReferenceExtractionPayload.parseDurationMs，
// 存 Chapter.referenceExtractionJson），刷新/换章回来仍在；AI 不产出该字段，由前端写入。
// 服务端对 referenceExtractionJson 只做不透明存取，字段契约全部落在客户端读取链路上，
// 这里用源码契约断言防止后续重构把耗时字段静默丢掉。
test("提取 payload 类型声明 parseDurationMs 元数据字段", () => {
  assert.match(sharedTypes, /parseDurationMs\?: number/);
});

test("normalizeExtraction 读取时保留 parseDurationMs（丢字段=刷新后耗时消失）", () => {
  assert.match(extractStage, /\.\.\.\(parseDurationMs \? \{ parseDurationMs \} : \{\}\)/);
});

test("解析落库写入本次耗时，且持久化的 JSON 不再是裸 extraction", () => {
  assert.match(draftStage, /JSON\.stringify\(\{ \.\.\.extraction, parseDurationMs \}\)/);
  assert.doesNotMatch(draftStage, /JSON\.stringify\(extraction\)/);
});

test("解析计时展示：进行中实时秒数 + 上次解析用时", () => {
  // 实时计秒：pending 期间 setInterval 每秒刷新。
  assert.match(draftStage, /parseElapsedLabel: parsePending \? `解析中 \$\{formatSeconds\(parseElapsedSeconds\)\}` : null/);
  // 「上次解析」从章节已保存的提取结果读取（容错解析器，不吃历史脏数据异常）。
  assert.match(draftStage, /parseReferenceExtraction\(workspace\.referenceExtractionJson\)\.parseDurationMs/);
  // 页面：两个标签都用 muted 小字渲染（JSX 表达式，无 $ 前缀）。
  assert.match(studioPage, /上次解析 \{referenceStage\.lastParseDurationLabel\}/);
  assert.match(studioPage, /\{referenceStage\.parseElapsedLabel\}/);
});

test("完成提示带用时（成功与无脚本两条路径）", () => {
  assert.match(draftStage, /已重写本章脚本（\$\{shotCount\} 个分镜，用时 \$\{durationLabel\}/);
  assert.match(draftStage, /AI 没有生成脚本（用时 \$\{durationLabel\}/);
});
