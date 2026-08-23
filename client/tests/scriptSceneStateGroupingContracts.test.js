import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);

test("场景行与角色状态面板属于同一个连续场景组", () => {
  const sceneRender = scriptTabSource.match(
    /item\.kind === "scene" \? \(([\s\S]*?)\) : item\.kind === "shot"/
  );

  assert.ok(sceneRender, "找不到脚本场景渲染分支");
  assert.match(
    sceneRender[1],
    /<div className="overflow-hidden rounded-xl border border-emerald-500\/30 bg-emerald-500\/10">[\s\S]*?<SceneRow[\s\S]*?<SceneStatePanel/,
  );
});

test("角色状态面板使用同组背景和分隔线，不再单独成为卡片", () => {
  const panelSource = scriptTabSource.match(
    /function SceneStatePanel\([\s\S]*?\r?\n}\r?\n\r?\nfunction SceneRow/
  );

  assert.ok(panelSource, "找不到角色状态面板实现");
  assert.match(panelSource[0], /border-t border-emerald-500\/20 bg-transparent/);
  assert.doesNotMatch(panelSource[0], /mt-1/);
  assert.doesNotMatch(panelSource[0], /rounded-xl border border-border\/60 bg-muted\/20/);
});

test("场景行不再绘制独立背景卡片", () => {
  const rowSource = scriptTabSource.match(
    /function SceneRow\([\s\S]*?\r?\n}\r?\n\r?\n\/\/ 角色状态/
  );

  assert.ok(rowSource, "找不到场景行实现");
  assert.doesNotMatch(rowSource[0], /rounded-xl bg-emerald-500\/10/);
});
