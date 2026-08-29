import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("设置路由保留漫剧所需页面并兼容旧模型路由链接", async () => {
  const source = await read("src/router/index.tsx");
  assert.match(source, /path: "settings\/models", element: <ModelsSettingsPage \/>/);
  assert.match(source, /path: "settings\/director", element: <DirectorSettingsPage \/>/);
  assert.match(source, /path: "settings\/knowledge", element: <KnowledgeSettingsPage \/>/);
  assert.match(source, /path: "settings\/narrator-voice", element: <NarratorVoiceSettingsPage \/>/);
  assert.match(source, /path: "settings\/appearance", element: <AppearanceSettingsPage \/>/);
  assert.match(source, /path: "settings\/records", element: <RecordsSettingsPage \/>/);
  assert.match(source, /path: "settings\/art-style", element: <ArtStyleSettingsPage \/>/);
  assert.match(source, /path: "settings", element: <SettingsOverviewPage \/>/);
  assert.match(source, /path: "settings\/model-routes", element: <Navigate to="\/settings\/models" replace \/>/);
});

test("系统设置页签保留漫剧配置并通过统一策略收起小说配置", async () => {
  const [sidebar, shell] = await Promise.all([
    read("src/components/layout/Sidebar.tsx"),
    read("src/pages/settings/components/SettingsShell.tsx"),
  ]);
  assert.doesNotMatch(sidebar, /label: "模型路由"/);
  for (const label of ["设置总览", "模型设置", "自动导演", "知识库与写法", "旁白音色", "外观与主题", "记录", "画风"]) {
    assert.match(shell, new RegExp(label));
  }
  assert.match(shell, /isNavRouteVisible/);
});

test("漫剧专注模式隐藏小说 readiness 并保留漫剧设置卡片", async () => {
  const source = await read("src/pages/settings/views/SettingsOverviewPage.tsx");
  assert.match(source, /isDramaFocusFeatureVisible/);
  assert.match(source, /novel-readiness/);
  assert.match(source, /enabled: SHOW_NOVEL_READINESS/);
  assert.match(source, /SHOW_NOVEL_READINESS \? <SettingsReadinessCard items=\{items\} \/> : null/);
  assert.match(source, /settings\/models/);
  assert.match(source, /settings\/narrator-voice/);
});
