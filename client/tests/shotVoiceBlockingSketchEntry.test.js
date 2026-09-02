import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url), "utf8");

test("每一镜的画面区域都有摆位入口，并在保存后刷新当前项目", () => {
  assert.doesNotMatch(source, /ShotBlockingSketchDialog/);
  assert.match(source, /3D 草图/);
  assert.doesNotMatch(source, /2D 草图/);
  assert.match(source, /encodeURIComponent\(props\.projectId\)/);
});

test("3D图/AI图切换是整集统一的工具栏模式，放在合成按钮左侧", () => {
  const toolbarStart = source.indexOf("const storyboardToolbar");
  const toolbarEnd = source.indexOf("return (", toolbarStart);
  const toolbarSource = source.slice(toolbarStart, toolbarEnd);
  const toggleIndex = toolbarSource.indexOf("分镜预览类型");
  const assemblyIndex = toolbarSource.indexOf("<DramaEpisodeAssemblyButton");

  assert.ok(toggleIndex >= 0, "工具栏必须包含预览类型切换");
  assert.ok(
    assemblyIndex > toggleIndex,
    "预览类型切换必须渲染在合成按钮之前（左侧）",
  );
  assert.match(toolbarSource, />\s*3D图\s*<\/button>/);
  assert.match(toolbarSource, />\s*AI图\s*<\/button>/);
  // 分镜列表默认展示 3D 摆位草图（3D 摄像机实拍取景），AI 画面是可选切换。
  assert.match(source, /const \[previewMode, setPreviewMode\] = useState<PreviewKind>\("sketch"\)/);
  assert.match(source, /previewMode=\{previewMode\}/);
});

test("单镜不再携带独立切换，保留编辑 3D 和生成 AI 图操作", () => {
  assert.doesNotMatch(source, /role="tablist"/);
  assert.doesNotMatch(source, /role="tab"/);
  assert.doesNotMatch(source, /\["ArrowLeft", "ArrowRight"\]/);
  assert.match(source, /previewMode: PreviewKind/);
  assert.match(source, /编辑3D/);
  assert.doesNotMatch(source, /AI摆位/);
  assert.match(source, /生成AI图/);
  assert.match(source, /重新生图/);
  assert.match(source, /sm:w-\[26rem\]/);
});

test("3D 模式逐镜显示草图，缺图时显示占位；AI 模式保留无 AI 图回退草图", () => {
  assert.match(source, /props\.previewMode === "sketch"/);
  assert.match(source, /暂无 3D 图/);
  assert.match(source, /const hasReadyAiPreview/);
  assert.match(source, /blockingSketchUrl && !hasReadyAiPreview/);
});

test("场景图换版后过期草图显示状态徽标，引导重新截图", () => {
  assert.match(source, /isBlockingSketchSceneImageStale/);
  assert.match(source, /sceneImageVersions/);
  assert.match(source, /场景图已更新/);
});

test("AI 图和 3D 图使用生成版本刷新缓存，AI 图加载失败时回退到 3D 草图", () => {
  assert.match(source, /generatedAt/);
  assert.match(source, /cache|version/);
  assert.match(source, /onError/);
  assert.match(source, /暂无可用 AI 画面|AI 图不可用/);
  assert.doesNotMatch(source, /autoPlan=1/);
});

test("分镜页不再提供旧分镜工作台入口", () => {
  assert.doesNotMatch(source, /打开完整分镜工作台/);
  assert.doesNotMatch(source, /先在完整分镜工作台/);
  assert.match(source, /还没有分集。切换到「脚本」页签/);
});
