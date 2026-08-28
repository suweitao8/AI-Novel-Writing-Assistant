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

test("共享 3D 工作台把控制栏放在左侧并让视口占据右侧", () => {
  assert.match(shell, /h-full/);
  assert.match(shell, /min-h-0/);
  assert.match(shell, /overflow-hidden/);
  assert.match(shell, /xl:grid-cols-\[22rem_minmax\(0,1fr\)\]/);
  assert.match(shell, /<aside aria-label="场景编辑控制栏"/);
  assert.match(shell, /data-editor-region="objects"/);
  assert.match(shell, /data-editor-region="actions"/);
  assert.match(shell, /data-editor-region="viewport"/);
  assert.match(scenePage, /label: "世界"/);
  assert.match(blockingPage, /label: "世界"/);
  assert.match(objectPanel, /aria-pressed/);
  assert.match(objectPanel, /focus-visible:ring/);
});

test("两个页面都注册根场景对象并接入共享工作台", () => {
  assert.match(scenePage, /kind: "scene"/);
  assert.match(blockingPage, /kind: "scene"/);
  assert.match(scenePage, /Drama3DEditorShell/);
  assert.match(blockingPage, /Drama3DEditorShell/);
  assert.match(shell, /aria-label="属性面板"/);
});

test("对象树只显示图标和名称，列表与属性内容各自在区域内滚动", () => {
  assert.doesNotMatch(objectPanel, /item\.meta/);
  assert.doesNotMatch(objectPanel, /item\.trailing/);
  assert.doesNotMatch(scenePage, /\n\s+meta:/);
  assert.doesNotMatch(blockingPage, /\n\s+meta:/);
  assert.match(shell, /grid-rows-\[minmax\(0,33\.333%\)_minmax\(0,1fr\)\]/);
  assert.match(shell, /gap-2/);
  assert.match(shell, /aria-label="属性面板"/);
  assert.match(shell, /data-editor-region="objects"[^>]*className="h-full min-h-0 overflow-hidden"/);
  assert.match(shell, /data-editor-region="actions"[^>]*className="h-full min-h-0 overflow-hidden"/);
  assert.match(objectPanel, /overflow-y-auto/);
  assert.match(scenePage, /overflow-y-auto/);
  assert.match(blockingPage, /overflow-y-auto/);
});

test("对象列表使用世界和参考角色语义，空间标记条目由功能开关门控", () => {
  assert.match(scenePage, /label: "世界"/);
  assert.match(scenePage, /label: "参考角色"/);
  assert.match(scenePage, /visibleSceneMarkers\.map/);
  assert.doesNotMatch(scenePage, /label: "场景对象"/);
  assert.doesNotMatch(scenePage, /label: "比例参照"/);

  assert.match(blockingPage, /label: "世界"/);
  assert.match(blockingPage, /STORY_SCENE_3D_MARKERS_ENABLED \? context\.scene\.markers\.map/);
});

test("对象卡和属性卡不重复显示标题与标题图标", () => {
  assert.doesNotMatch(objectPanel, /CardHeader|CardTitle|<Box/);
  assert.doesNotMatch(scenePage, /CardHeader|CardTitle/);
  assert.doesNotMatch(blockingPage, /CardHeader|CardTitle/);
});

test("顶部导航只保留返回入口和当前主名称", () => {
  assert.match(scenePage, /data-editor-header="primary"/);
  assert.match(blockingPage, /data-editor-header="primary"/);
  assert.match(scenePage, /scene\.name/);
  assert.match(blockingPage, /第 \$\{shotOrder\} 镜 3D 草图/);
  assert.doesNotMatch(scenePage, /场景资产 · 3D 场景编辑/);
  assert.doesNotMatch(scenePage, /\{status\}<\/span>/);
  assert.doesNotMatch(blockingPage, /左键拖动角色，右键旋转视角/);
  assert.doesNotMatch(blockingPage, /<Badge variant=\{!dirty/);
});

test("可移动角色属性包含位置、旋转和大小", () => {
  assert.match(blockingPage, /<dt>位置<\/dt>/);
  assert.match(blockingPage, /<dt>旋转<\/dt>/);
  assert.match(blockingPage, /<dt>大小<\/dt>/);
  assert.match(blockingPage, /selectedTransform\?\.scale/);
});

test("编辑器视口不再用固定 16:9 容器", () => {
  assert.doesNotMatch(scenePage, /CardContent className="relative aspect-video/);
  assert.doesNotMatch(blockingPage, /CardContent className="relative aspect-video/);
  assert.match(scenePage, /h-full min-h-0/);
  assert.match(blockingPage, /h-full min-h-0/);
});
