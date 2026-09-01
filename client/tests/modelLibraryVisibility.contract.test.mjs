import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../src/pages/models/ModelLibraryPage.tsx", import.meta.url), "utf8");

test("模型库页面从服务端加载可见性并在失败时提供重试", () => {
  assert.match(pageSource, /getModelLibraryVisibility/);
  assert.match(pageSource, /hiddenModelIds/);
  assert.match(pageSource, /data-model-library-visibility-state/);
  assert.match(pageSource, /重试/);
});
