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

test("源贴图有透明像素时禁止用 JPG 丢失 alpha", () => {
  const baseColor = "/models/cine57/tex/grass.jpg";
  const errors = validateModelTextureContract({
    entry: { id: "alpha-loss", materials: { MI_Grass: { baseColor } } },
    availableTexturePaths: new Set([baseColor]),
    importAuditByTexture: {
      [baseColor]: { preserveAlpha: true, sourceStatus: "probed", pixelFormat: "rgba", alphaMinimum: 0 },
    },
  });
  assert.ok(errors.some((error) => error.includes("source alpha") && error.includes("PNG")));

  const independentOpacity = "/models/cine57/tex/grass-opacity.png";
  assert.deepEqual(
    validateModelTextureContract({
      entry: {
        id: "alpha-loss-with-mask",
        materials: { MI_Grass: { baseColor, opacity: independentOpacity } },
      },
      availableTexturePaths: new Set([baseColor, independentOpacity]),
      importAuditByTexture: {
        [baseColor]: { preserveAlpha: true, sourceStatus: "probed", pixelFormat: "rgba", alphaMinimum: 0 },
      },
    }),
    [],
  );
});

test("目录引用的贴图文件必须真实存在", () => {
  const errors = validateModelTextureContract({
    entry: ENTRY,
    glbMaterials: [GLB_MATERIAL],
    availableTexturePaths: new Set(["/models/cine57/tex/grass.png"]),
  });
  assert.ok(errors.some((error) => error.includes("grass.jpg")));
});

test("未绑定的内嵌 1x1 baseColor 占位图必须被拒绝", () => {
  const errors = validateModelTextureContract({
    entry: { id: "bad-material" },
    glbMaterials: [{
      name: "MI_BadMaterial",
      alphaMode: "OPAQUE",
      hasBaseColorTexture: true,
      baseColorTexture: {
        embedded: true,
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
    }],
  });
  assert.ok(errors.some((error) => error.includes(
    "bad-material MI_BadMaterial uses an unresolved embedded 1x1 baseColor placeholder",
  )));

  const mappedErrors = validateModelTextureContract({
    entry: { id: "mapped-material", materials: { MI_BadMaterial: { tint: [0.42, 0.42, 0.45] } } },
    glbMaterials: [{
      name: "MI_BadMaterial",
      alphaMode: "OPAQUE",
      hasBaseColorTexture: true,
      baseColorTexture: {
        embedded: true,
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
    }],
  });
  assert.deepEqual(mappedErrors, []);
});

test("任何带 baseColorTexture 的 GLB 材质都必须有目录绑定", () => {
  const errors = validateModelTextureContract({
    entry: { id: "missing-material" },
    glbMaterials: [{
      name: "MI_RealTexture",
      alphaMode: "OPAQUE",
      hasBaseColorTexture: true,
      baseColorTexture: { embedded: false, mimeType: "image/jpeg", width: 2048, height: 2048 },
    }],
  });
  assert.ok(errors.some((error) => error.includes(
    "missing-material GLB baseColor material is missing catalog mapping: MI_RealTexture",
  )));
});
