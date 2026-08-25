import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("画风管理明确展示全局写实美术基线", () => {
  const pageSource = read("pages/artStyle/ArtStyleLibraryPage.tsx");

  assert.match(pageSource, /通用美术风格/);
  assert.match(pageSource, /写实影视化/);
});
