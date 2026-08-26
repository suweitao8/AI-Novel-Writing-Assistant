import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath) => {
  const absolutePath = path.join(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const shell = read("src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx");
const objectPanel = read("src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx");
const scenePage = read("src/pages/drama/comicDrama/DramaScene3DPage.tsx");
const blockingPage = read("src/pages/drama/comicDrama/DramaBlocking3DPage.tsx");

test("共享 3D 工作台使用满高布局并把右侧拆成对象和操作两区", () => {
  assert.match(shell, /h-full/);
  assert.match(shell, /min-h-0/);
  assert.match(shell, /grid-rows-/);
  assert.match(shell, /overflow-hidden/);
  assert.match(objectPanel, /场景对象/);
  assert.match(objectPanel, /aria-pressed/);
  assert.match(objectPanel, /focus-visible:ring/);
});

test("两个页面都注册根场景对象并接入共享工作台", () => {
  assert.match(scenePage, /kind: "scene"/);
  assert.match(blockingPage, /kind: "scene"/);
  assert.match(scenePage, /Drama3DEditorShell/);
  assert.match(blockingPage, /Drama3DEditorShell/);
  assert.match(scenePage, /属性与操作/);
  assert.match(blockingPage, /属性与操作/);
});

test("编辑器视口不再用固定 16:9 容器", () => {
  assert.doesNotMatch(scenePage, /CardContent className="relative aspect-video/);
  assert.doesNotMatch(blockingPage, /CardContent className="relative aspect-video/);
  assert.match(scenePage, /h-full min-h-0/);
  assert.match(blockingPage, /h-full min-h-0/);
});
