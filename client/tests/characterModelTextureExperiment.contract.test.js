import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MODEL_LIBRARY_CATEGORIES,
  getModelLibraryEntry,
} from "../src/config/modelLibrary.ts";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("模型库提供复用 UAL2 角色代理的角色条目", () => {
  assert.ok(MODEL_LIBRARY_CATEGORIES.includes("角色"));

  const entry = getModelLibraryEntry("ual2-college-student");
  assert.ok(entry);
  assert.equal(entry.category, "角色");
  assert.equal(entry.fileUrl, "/anims/cine57/UAL2_UE_Anims.glb");
  assert.equal(entry.previewAppearance, "character-texture-test");
});

test("角色外观测试使用确定性位置投影纹理，并提供蓝色对照模式", () => {
  const appearanceSource = read("../src/pages/models/modelLibrary3d/characterAppearance.ts");

  assert.match(appearanceSource, /CHARACTER_TEXTURE_SIZE/);
  assert.match(appearanceSource, /male-college-student/);
  assert.match(appearanceSource, /BLOCKING_3D_BLUE_ACTOR_COLOR/);
  assert.match(appearanceSource, /vPositionW/);
  assert.match(appearanceSource, /characterTexture/);
  assert.match(appearanceSource, /setMode/);
  assert.match(appearanceSource, /destroy/);
});

test("模型详情和模型缩略图只对声明测试外观的条目启用角色材质", () => {
  const viewerSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
  const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
  const editorSource = read("../src/pages/models/ModelEditorPage.tsx");

  assert.match(viewerSource, /previewAppearance/);
  assert.match(viewerSource, /createCharacterAppearanceController/);
  assert.match(viewerSource, /setAppearance/);
  assert.match(thumbnailSource, /previewAppearance/);
  assert.match(thumbnailSource, /createCharacterAppearanceController/);
  assert.match(editorSource, /角色外观/);
  assert.match(editorSource, /男大学生测试纹理/);
  assert.match(editorSource, /蓝色模型/);
});
