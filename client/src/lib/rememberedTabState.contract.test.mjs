import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.join(import.meta.dirname, "..", "pages");
const read = (...parts) => readFileSync(path.join(sourceRoot, ...parts), "utf8");

test("模型库和动画库分别记住各自的分类页签", () => {
  const modelSource = read("models", "ModelLibraryPage.tsx");
  const animationSource = read("animations", "AnimationLibraryPage.tsx");
  assert.match(modelSource, /useRememberedTab/);
  assert.match(modelSource, /models:library-category/);
  assert.match(animationSource, /useRememberedTab/);
  assert.match(animationSource, /animations:library-category/);
});

test("对象工作区的页签 scope 包含对象 id", () => {
  const dramaSource = read("drama", "DramaProjectPage.tsx");
  const worldSource = read("worlds", "WorldWorkspace.tsx");
  const simpleSource = read("novels", "simpleCreation", "SimpleNovelShelfPage.tsx");
  assert.match(dramaSource, /drama-project:\$\{id \?\? "none"\}:main-stage/);
  assert.match(worldSource, /world:\$\{id \|\| "none"\}:workspace/);
  assert.match(simpleSource, /novel:\$\{id \|\| "none"\}:simple-shelf/);
});

test("URL 页签使用统一的记忆 Hook", () => {
  const knowledgeSource = read("knowledge", "KnowledgePage.tsx");
  assert.match(knowledgeSource, /useRememberedQueryTab/);
  assert.match(knowledgeSource, /knowledge:workspace/);
});

test("URL 页签的无效值规范化为默认值，不被旧记忆覆盖", () => {
  const queryHookSource = readFileSync(
    path.join(import.meta.dirname, "..", "hooks", "useRememberedQueryTab.ts"),
    "utf8",
  );
  assert.match(queryHookSource, /hasInvalidQueryParam/);
  assert.match(queryHookSource, /hasInvalidQueryParam \? options\.defaultValue/);
  assert.match(queryHookSource, /next\.set\(queryParam, options\.defaultValue\)/);
});

test("拆书视图和漫剧阶段的无效 URL 也固定回退默认页签", () => {
  const bookAnalysisViewSource = read("bookAnalysis", "hooks", "useBookAnalysisActiveView.ts");
  const dramaStudioSource = read("drama", "comicDrama", "ComicDramaStudioPage.tsx");
  assert.match(bookAnalysisViewSource, /hasInvalidViewParam/);
  assert.match(bookAnalysisViewSource, /next\.set\("view", DEFAULT_VIEW\)/);
  assert.match(dramaStudioSource, /next\.set\("stage", "script"\)/);
});

test("拆书和提示词工作区按稳定对象或工作区记住当前页签", () => {
  const bookAnalysisViewSource = read("bookAnalysis", "hooks", "useBookAnalysisActiveView.ts");
  const bookAnalysisDetailSource = read("bookAnalysis", "components", "BookAnalysisDetailPanel.tsx");
  const promptWorkbenchSource = read("promptWorkbench", "PromptWorkbenchPage.tsx");
  const promptPreviewSource = read("promptWorkbench", "components", "PromptPreviewPanel.tsx");
  const promptDraftSource = read("promptWorkbench", "hooks", "usePromptDraftSlots.ts");
  assert.match(bookAnalysisViewSource, /useRememberedTab/);
  assert.match(bookAnalysisViewSource, /book-analysis:\$\{analysisId\}:main-view/);
  assert.match(bookAnalysisDetailSource, /book-analysis:\$\{selectedAnalysis\.id\}:section/);
  assert.match(promptWorkbenchSource, /prompt-workbench:edit-mode/);
  assert.match(promptPreviewSource, /prompt:\$\{preview\.prompt\.key\}:preview-message/);
  assert.match(promptDraftSource, /prompt-workbench:override-scope/);
});

test("创建类工作区的可重复入口也保留上次页签", () => {
  const dramaSource = read("drama", "comicDrama", "ComicDramaStudioPage.tsx");
  const titleFactorySource = read("titles", "components", "TitleFactoryPanel.tsx");
  const writingFormulaSource = read("writingFormula", "components", "WritingFormulaCreateDialog.tsx");
  const quickFillSource = read("novels", "components", "titleWorkshop", "NovelCreateTitleQuickFill.tsx");
  const errorsSource = read("settings", "components", "RecentErrorsCard.tsx");
  assert.match(dramaSource, /drama-project:\$\{novelId \|\| "none"\}:studio-stage/);
  assert.match(titleFactorySource, /titles:factory-mode/);
  assert.match(writingFormulaSource, /writing-formula:create-dialog/);
  assert.match(quickFillSource, /novels:create-title-mode/);
  assert.match(errorsSource, /settings:error-filter/);
});

test("统一 Tabs 组件提供记忆页签能力的入口", () => {
  const tabsSource = readFileSync(
    path.join(import.meta.dirname, "..", "components", "ui", "tabs.tsx"),
    "utf8",
  );
  assert.match(tabsSource, /useRememberedTab/);
  assert.match(tabsSource, /rememberedKey/);
});
