import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const clientRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(clientRoot, "..");
const readClient = (relativePath) => readFileSync(path.join(clientRoot, relativePath), "utf8");

test("drama-first router does not lazy-load retired product pages", () => {
  const router = readClient("src/router/index.tsx");

  for (const retiredPage of [
    "@/pages/Home",
    "@/pages/novels/NovelList",
    "@/pages/novels/NovelCreate",
    "@/pages/comic/ComicWorkspacePage",
    "@/pages/comic/ComicProjectPage",
    "@/pages/creativeHub/CreativeHubPage",
    "@/pages/bookAnalysis/BookAnalysisPage",
    "@/pages/worlds/WorldList",
    "@/pages/writingFormula/WritingFormulaPage",
  ]) {
    assert.equal(router.includes(`import("${retiredPage}")`), false, retiredPage);
  }
});

test("legacy product routes resolve into the drama workflow", () => {
  const router = readClient("src/router/index.tsx");

  assert.match(router, /\{ index: true, element: <RedirectToDrama \/> \}/);
  for (const route of [
    'path: "novels"',
    'path: "comic/*"',
    'path: "creative-hub"',
    'path: "book-analysis"',
    'path: "worlds/*"',
    'path: "auto-director/*"',
  ]) {
    assert.ok(router.includes(`{ ${route}, element: <RedirectToDrama /> }`), route);
  }
  assert.match(router, /`\/drama\/studio\/\$\{encodeURIComponent\(id\)\}`/);
});

test("shared image-generation types no longer depend on the comic API module", () => {
  const sharedTypes = readClient("src/api/media/imageGenerationTypes.ts");
  assert.match(sharedTypes, /export interface ImageGenerationPreview/);
  assert.match(sharedTypes, /export interface ImageGenerationOverrides/);

  for (const consumer of [
    "src/api/bookAnalysis.ts",
    "src/api/media/drama.ts",
    "src/components/image/useImageGenerationFlow.ts",
    "src/components/image/ImageGenerationConfirmDialog.tsx",
    "src/pages/drama/components/DramaVisualPanel.tsx",
  ]) {
    assert.match(readClient(consumer), /imageGenerationTypes/);
    assert.doesNotMatch(readClient(consumer), /@\/api\/media\/comic/);
  }
});

test("retired comic UI keeps its server compatibility mount", () => {
  const app = readFileSync(path.join(repoRoot, "server/src/app.ts"), "utf8");
  assert.match(app, /app\.use\("\/api\/comic", comicRouter\)/);
});

test("retained knowledge surface does not link to retired novel workspaces", () => {
  const overview = readClient("src/pages/knowledge/components/KnowledgeLibraryOverview.tsx");
  const documents = readClient("src/pages/knowledge/components/KnowledgeDocumentsTab.tsx");

  assert.doesNotMatch(overview, /OpenInCreativeHubButton|\/creative-hub/);
  assert.doesNotMatch(documents, /OpenInCreativeHubButton|\/creative-hub|\/book-analysis/);
  assert.match(overview, /漫剧脚本与资产设定/);
});

test("application branding identifies the drama workspace", () => {
  const html = readClient("index.html");
  const topNav = readClient("src/components/layout/TopNav.tsx");

  assert.match(html, /AI 漫剧工作台 \| AI Drama Production Engine/);
  assert.match(topNav, /漫剧工作台/);
});
