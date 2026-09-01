import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("工作台 token 覆盖 surface、control、shadow 与 motion", () => {
  const css = read("index.css");
  for (const token of [
    "--surface-panel",
    "--surface-subtle",
    "--control-hover",
    "--shadow-panel",
    "--duration-base",
    "--ease-out-quint",
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`));
  }
  assert.match(css, /\.studio-shell/);
  assert.match(css, /prefers-reduced-motion/);
});

test("共享壳层和基础组件使用工作台语义边界", () => {
  assert.match(read("components/layout/AppLayout.tsx"), /studio-shell/);
  assert.match(read("components/layout/TopNav.tsx"), /studio-top-nav/);
  assert.match(read("components/layout/Sidebar.tsx"), /studio-sidebar/);
  assert.match(read("components/ui/card.tsx"), /studio-card/);
  assert.match(read("components/ui/button.tsx"), /studio-button/);
});

test("基础组件不回退到硬编码白色或 slate 背景", () => {
  for (const relativePath of [
    "components/ui/card.tsx",
    "components/ui/button.tsx",
    "components/ui/input.tsx",
    "components/ui/badge.tsx",
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /bg-white|text-black|bg-slate-/);
  }
});

test("主要入口保留工作台页面语义标记和导航名称", () => {
  const pageContracts = [
    ["pages/Home.tsx", /studio-page/],
    ["pages/drama/DramaProjectPage.tsx", /studio-page/],
    ["pages/drama/comicDrama/ComicDramaListPage.tsx", /studio-page/],
    ["pages/novels/NovelList.tsx", /studio-page/],
    ["pages/novels/NovelCreate.tsx", /studio-page/],
    ["pages/settings/views/SettingsOverviewPage.tsx", /studio-page/],
  ];
  for (const [relativePath, marker] of pageContracts) {
    assert.match(read(relativePath), marker, relativePath);
  }

  assert.match(read("pages/drama/comicDrama/ComicDramaListPage.tsx"), /创建漫剧/);
  assert.match(read("pages/novels/NovelList.tsx"), /继续创作/);
  assert.match(read("pages/settings/views/SettingsOverviewPage.tsx"), /系统设置/);
});
