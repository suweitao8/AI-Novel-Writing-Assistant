import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../src/pages/models/ModelEditorPage.tsx", import.meta.url), "utf8");

test("模型详情页提供删除按钮和二次确认弹窗", () => {
  assert.match(pageSource, /from "@\/components\/ui\/dialog"/);
  assert.match(pageSource, /getModelLibraryVisibility/);
  assert.match(pageSource, /hiddenModelIds\.has\(entry\.id\)/);
  assert.match(pageSource, /hideModelLibraryEntry/);
  assert.match(pageSource, /删除模型/);
  assert.match(pageSource, /将从模型库中隐藏/);
  assert.match(pageSource, /模型文件和已有分镜引用会保留/);
  assert.match(pageSource, /删除中/);
  assert.match(pageSource, /data-model-delete-dialog/);
});
