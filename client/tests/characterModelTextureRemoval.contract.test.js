import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MODEL_LIBRARY_CATEGORIES,
  getModelLibraryEntry,
} from "../src/config/modelLibrary.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(__dirname, "..");

const readClientFile = (relativePath) =>
  readFileSync(resolve(clientRoot, relativePath), "utf8");

test("角色模型保留为蓝色 UAL2 入口，不再暴露测试纹理配置", () => {
  assert.ok(MODEL_LIBRARY_CATEGORIES.includes("角色"));

  const roleEntry = getModelLibraryEntry("ual2-college-student");
  assert.ok(roleEntry);
  assert.equal(roleEntry.category, "角色");
  assert.equal(roleEntry.fileUrl, "/anims/cine57/UAL2_UE_Anims.glb");
  assert.equal(roleEntry.previewAppearance, undefined);
  assert.notEqual(roleEntry.name, "男大学生角色（纹理测试）");
  assert.deepEqual(roleEntry.materials, {
    M_Main: { tint: [0.24, 0.52, 0.82] },
    M_Joints: { tint: [0.24, 0.52, 0.82] },
  });
});

test("测试纹理实现和详情页外观切换已移除", () => {
  assert.equal(
    existsSync(resolve(clientRoot, "src/pages/models/modelLibrary3d/characterAppearance.ts")),
    false,
  );

  const sourceFiles = [
    "src/config/modelLibrary.ts",
    "src/pages/models/modelLibrary3d/modelViewerApp.ts",
    "src/pages/models/modelLibrary3d/thumbnailStudio.ts",
    "src/pages/models/ModelEditorPage.tsx",
    "../scripts/models/modelLibraryQuality.mjs",
    "../scripts/models/curate-cine57-library.mjs",
    "../scripts/models/modelLibraryVisualReview.mjs",
  ];

  for (const relativePath of sourceFiles) {
    const source = readClientFile(relativePath);
    for (const forbidden of [
      "previewAppearance",
      "CharacterAppearance",
      "characterAppearance",
      "male-college-student",
      "男大学生测试纹理",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${relativePath} still contains ${forbidden}`,
      );
    }
  }

  const editorSource = readClientFile("src/pages/models/ModelEditorPage.tsx");
  const viewerSource = readClientFile("src/pages/models/modelLibrary3d/modelViewerApp.ts");
  const thumbnailSource = readClientFile("src/pages/models/modelLibrary3d/thumbnailStudio.ts");

  assert.equal(editorSource.includes("角色外观"), false);
  assert.equal(editorSource.includes("setAppearance"), false);
  assert.equal(viewerSource.includes("setAppearance"), false);
  assert.match(thumbnailSource, /applyModelMaterials/);
});
