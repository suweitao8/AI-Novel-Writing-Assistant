import assert from "node:assert/strict";
import test from "node:test";

import { validateModelTextureContract } from "./modelLibraryTextureAudit.mjs";

const ENTRY = {
  id: "grass-test",
  materials: {
    MI_Grass: {
      baseColor: "/models/cine57/tex/grass.png",
      opacity: "/models/cine57/tex/grass.png",
      normal: "/models/cine57/tex/grass.jpg",
    },
  },
};

const GLB_MATERIAL = { name: "MI_Grass", alphaMode: "BLEND" };
const TEXTURES = new Set([
  "/models/cine57/tex/grass.png",
  "/models/cine57/tex/grass.jpg",
]);

test("带透明材质的 GLB 必须绑定 opacity 贴图或透明标量", () => {
  assert.deepEqual(
    validateModelTextureContract({
      entry: ENTRY,
      glbMaterials: [GLB_MATERIAL],
      availableTexturePaths: TEXTURES,
    }),
    [],
  );

  const errors = validateModelTextureContract({
    entry: { ...ENTRY, materials: { MI_Grass: { baseColor: "/models/cine57/tex/grass.jpg" } } },
    glbMaterials: [GLB_MATERIAL],
    availableTexturePaths: new Set(["/models/cine57/tex/grass.jpg"]),
  });
  assert.ok(errors.some((error) => error.includes("opacity")));
});

test("PNG baseColor 没有透明映射时不能通过", () => {
  const errors = validateModelTextureContract({
    entry: { ...ENTRY, materials: { MI_Grass: { baseColor: "/models/cine57/tex/grass.png" } } },
    glbMaterials: [{ name: "MI_Grass", alphaMode: "OPAQUE" }],
    availableTexturePaths: new Set(["/models/cine57/tex/grass.png"]),
  });
  assert.ok(errors.some((error) => error.includes("alpha") || error.includes("opacity")));
});

test("目录引用的贴图文件必须真实存在", () => {
  const errors = validateModelTextureContract({
    entry: ENTRY,
    glbMaterials: [GLB_MATERIAL],
    availableTexturePaths: new Set(["/models/cine57/tex/grass.png"]),
  });
  assert.ok(errors.some((error) => error.includes("grass.jpg")));
});
