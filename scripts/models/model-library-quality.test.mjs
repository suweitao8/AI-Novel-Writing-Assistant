import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MODEL_LIBRARY } from "../../client/src/config/modelLibrary.ts";
import { readGlb, stripUnsupportedGlb } from "./glbSanitizer.mjs";
import {
  inspectGlb,
  MAX_FOREGROUND_MODEL_DIMENSION_METERS,
  validateModelLibrary,
} from "./modelLibraryQuality.mjs";
import {
  CINE57_CATEGORY_ORDER,
  CINE57_MODEL_LIBRARY_CONTRACT,
  CINE57_MAX_FOOD_CONTAINER_ENTRIES,
  CINE57_MINIMUM_MODEL_COUNT,
  CINE57_QUARANTINED_ASSETS,
  CINE57_QUARANTINED_MODEL_IDS,
  CINE57_REJECTED_FOREGROUND_MODEL_IDS,
  CINE57_REMOVED_MODEL_IDS,
  CINE57_REQUIRED_CATEGORIES,
  assertCine57ModelLibraryContract,
  isFoodContainerModel,
} from "./modelLibraryPolicy.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const REMOVED_IDS = new Set(CINE57_REMOVED_MODEL_IDS);
const REQUIRED_FINE_GRAINED_CATEGORIES = CINE57_REQUIRED_CATEGORIES;
const STATIC_MODEL_LIBRARY = MODEL_LIBRARY.filter((entry) => entry.fileUrl.startsWith("/models/cine57/"));

test("模型库声明 Cine57 现代写实准入契约", () => {
  assert.deepEqual(CINE57_MODEL_LIBRARY_CONTRACT, {
    source: "Cine57",
    artDirection: "realistic",
    era: "modern",
    visualReviewRequired: true,
  });
  assert.deepEqual([...new Set(STATIC_MODEL_LIBRARY.map((entry) => entry.source))], ["Cine57"]);
});

test("模型库准入契约缺失或被篡改时拒绝回退到默认值", () => {
  assert.throws(
    () => assertCine57ModelLibraryContract(undefined),
    /must explicitly declare Cine57 modern realistic visual review contract/,
  );
  assert.throws(
    () => assertCine57ModelLibraryContract({
      source: "OtherPack",
      artDirection: "stylized",
      era: "antique",
      visualReviewRequired: false,
    }),
    /must explicitly declare Cine57 modern realistic visual review contract/,
  );
});

test("模型库质量门禁拒绝不属于 Cine57 的静态条目", () => {
  const invalidLibrary = MODEL_LIBRARY.map((entry) => (
    entry.id === STATIC_MODEL_LIBRARY[0].id
      ? { ...entry, source: "OtherPack", fileUrl: `/models/other/${entry.fileName}` }
      : entry
  ));
  const errors = validateModelLibrary({ library: invalidLibrary, modelsDir: MODELS_DIR });
  assert.ok(errors.includes(`${STATIC_MODEL_LIBRARY[0].id} must use Cine57 as its model source`));
  assert.ok(errors.includes(`${STATIC_MODEL_LIBRARY[0].id} must use /models/cine57/ as its static model path`));
});

function hasUnsupportedName(name) {
  return /^(?:UCX|UBX)(?:[_-]|$)/i.test(name)
    || /(?:^|[_-])LOD[_-]?([1-9]\d*)$/i.test(name);
}

function makeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20);
  const totalLength = 12 + 8 + jsonBytes.length + jsonPadding.length + 8 + bin.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonBytes.length + jsonPadding.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  jsonPadding.copy(output, 20 + jsonBytes.length);
  const binHeader = 20 + jsonBytes.length + jsonPadding.length;
  output.writeUInt32LE(bin.length, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(output, binHeader + 8);
  return output;
}

function makeSanitizerFixture() {
  const bin = Buffer.alloc(12);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "RootNode", children: [1, 2, 3] },
      { name: "SM_Table", mesh: 0 },
      { name: "UCX_SM_Table" },
      { name: "SM_Table_LOD1", mesh: 1 },
    ],
    meshes: [
      { name: "SM_Table", primitives: [{ attributes: { POSITION: 0 } }] },
      { name: "SM_Table_LOD1", primitives: [{ attributes: { POSITION: 0 } }] },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] }],
  };
  return { buffer: makeGlb(json, bin), bin };
}

const ONE_BY_ONE_PLACEHOLDER_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function makeEmbeddedPlaceholderMaterialFixture() {
  const bin = Buffer.alloc(12);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "SM_BadMaterial", mesh: 0 }],
    meshes: [{
      name: "SM_BadMaterial",
      primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
    }],
    materials: [{
      name: "MI_BadMaterial",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
    }],
    textures: [{ source: 0 }],
    images: [{ uri: ONE_BY_ONE_PLACEHOLDER_PNG }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 1,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 1],
    }],
  };
  return makeGlb(json, bin);
}

test("GLB inspection exposes embedded base-color image dimensions", () => {
  const inspection = inspectGlb(makeEmbeddedPlaceholderMaterialFixture());
  assert.deepEqual(inspection.materials, [{
    name: "MI_BadMaterial",
    alphaMode: "OPAQUE",
    alphaCutoff: undefined,
    hasBaseColorTexture: true,
    baseColorTexture: {
      embedded: true,
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
  }]);
});

test("真实斧头 GLB 暴露缺失颜色贴图的 1×1 占位证据", () => {
  const axeFileName = "SM_Axe_Black_01.glb";
  assert.equal(fs.existsSync(path.join(MODELS_DIR, axeFileName)), true);
  const inspection = inspectGlb(fs.readFileSync(path.join(MODELS_DIR, axeFileName)));
  assert.deepEqual(
    inspection.materials.find((material) => material.name === "MI_Axe_Black_01")?.baseColorTexture,
    {
      embedded: true,
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
  );
});

test("Cine57 目录只发布前景交互资产，其他来源的角色入口独立计数", () => {
  assert.ok(STATIC_MODEL_LIBRARY.length >= CINE57_MINIMUM_MODEL_COUNT, `expected expanded library, found ${STATIC_MODEL_LIBRARY.length}`);
  assert.equal(MODEL_LIBRARY.length - STATIC_MODEL_LIBRARY.length, 1);
  assert.equal(MODEL_LIBRARY.find((entry) => entry.id === "ual2-college-student")?.category, "角色");
  assert.deepEqual(
    STATIC_MODEL_LIBRARY.filter((entry) => REMOVED_IDS.has(entry.id)).map((entry) => entry.id),
    [],
  );
});

test("材质不完整的模型只保留在可恢复隔离清单中", () => {
  const publishedIds = new Set(STATIC_MODEL_LIBRARY.map((entry) => entry.id));
  const publishedFiles = new Set(STATIC_MODEL_LIBRARY.map((entry) => entry.fileName));
  assert.equal(CINE57_QUARANTINED_ASSETS.length, 10);
  assert.deepEqual(
    CINE57_QUARANTINED_ASSETS.map((asset) => asset.id),
    [...CINE57_QUARANTINED_MODEL_IDS],
  );
  for (const asset of CINE57_QUARANTINED_ASSETS) {
    assert.equal(publishedIds.has(asset.id), false, `${asset.id} must not be published`);
    assert.equal(publishedFiles.has(asset.fileName), false, `${asset.fileName} must not be published`);
    assert.equal(fs.existsSync(path.join(MODELS_DIR, asset.fileName)), true, `${asset.fileName} must be recoverable`);
  }
});

test("每个当前模型和前景拒绝项都有可追溯的导入历史结论", () => {
  const history = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "model-library-import-history.json"), "utf8"));
  const byCatalogId = new Map(history.entries.map((entry) => [entry.evidence?.catalogId, entry]));
  for (const entry of STATIC_MODEL_LIBRARY) {
    assert.equal(byCatalogId.get(entry.id)?.status, "approved", `${entry.id} must have an approved history record`);
  }
  for (const id of CINE57_REJECTED_FOREGROUND_MODEL_IDS) {
    assert.equal(byCatalogId.get(id)?.status, "rejected", `${id} must have a rejected history record`);
  }
});

test("UAL2 角色的脖子材质与主体同色，关节材质保持浅色区分", () => {
  const actor = MODEL_LIBRARY.find((entry) => entry.id === "ual2-college-student");
  assert.ok(actor);
  assert.deepEqual(actor.materials?.M_Neck?.tint, actor.materials?.M_Main?.tint);
  assert.notDeepEqual(actor.materials?.M_Joints?.tint, actor.materials?.M_Main?.tint);
});

test("静态模型目录按策展分类顺序连续排列，角色资源位于末尾", () => {
  const categoryRank = new Map(CINE57_CATEGORY_ORDER.map((category, index) => [category, index]));
  const staticRanks = STATIC_MODEL_LIBRARY.map((entry) => categoryRank.get(entry.category));

  assert.equal(staticRanks.some((rank) => rank === undefined), false);
  assert.equal(
    staticRanks.every((rank, index) => index === 0 || rank >= staticRanks[index - 1]),
    true,
    STATIC_MODEL_LIBRARY.map((entry) => `${entry.id}:${entry.category}`).join(", "),
  );
  assert.equal(
    MODEL_LIBRARY.findIndex((entry) => entry.category === "角色") >= STATIC_MODEL_LIBRARY.length,
    true,
  );
});

test("模型库按自然和摆件细分类别发布", () => {
  const categories = new Set(MODEL_LIBRARY.map((entry) => entry.category));
  for (const category of REQUIRED_FINE_GRAINED_CATEGORIES) {
    assert.ok(categories.has(category), `missing category: ${category}`);
  }
});

test("纸箱/食材箱只保留两个代表模型", () => {
  const shipmentEntries = STATIC_MODEL_LIBRARY.filter(isFoodContainerModel);
  assert.ok(
    shipmentEntries.length <= CINE57_MAX_FOOD_CONTAINER_ENTRIES,
    `too many box variants: ${shipmentEntries.map((entry) => entry.id).join(", ")}`,
  );
});

test("目录引用的 GLB 不包含碰撞体或高阶 LOD 节点", () => {
  for (const entry of STATIC_MODEL_LIBRARY) {
    const names = inspectGlb(fs.readFileSync(path.join(MODELS_DIR, entry.fileName))).unsupportedNames;
    assert.equal(
      names.length,
      0,
      `${entry.id} contains unsupported GLB name: ${names[0]}`,
    );
  }
});

test("前景模型最大尺寸不超过 5 米", () => {
  for (const entry of STATIC_MODEL_LIBRARY) {
    const inspection = inspectGlb(fs.readFileSync(path.join(MODELS_DIR, entry.fileName)));
    assert.ok(
      inspection.maxDimensionMeters <= MAX_FOREGROUND_MODEL_DIMENSION_METERS,
      `${entry.id} is ${inspection.maxDimensionMeters.toFixed(3)}m`,
    );
  }
});

test("模型库质量门禁汇总所有违规", () => {
  const errors = validateModelLibrary({ library: MODEL_LIBRARY, modelsDir: MODELS_DIR });
  assert.deepEqual(errors, []);
});

test("模型库质量门禁拒绝无法解析到模型目录内的贴图路径", () => {
  const libraryWithExternalTexture = MODEL_LIBRARY.map((entry) => (
    entry.id === "crop-arugula-01a"
      ? {
        ...entry,
        materials: {
          MI_Arugula_Leafs: {
            ...entry.materials.MI_Arugula_Leafs,
            baseColor: "https://example.invalid/arugula.png",
          },
        },
      }
      : entry
  ));
  const errors = validateModelLibrary({ library: libraryWithExternalTexture, modelsDir: MODELS_DIR });
  assert.ok(errors.includes(
    "crop-arugula-01a MI_Arugula_Leafs baseColor texture is missing: https://example.invalid/arugula.png",
  ));
});

test("模型库质量门禁拒绝缺少使用说明的条目", () => {
  const libraryWithoutUsage = MODEL_LIBRARY.map((entry, index) => (
    index === 0 ? { ...entry, usage: undefined } : entry
  ));
  const errors = validateModelLibrary({ library: libraryWithoutUsage, modelsDir: MODELS_DIR });
  assert.ok(errors.includes(`${MODEL_LIBRARY[0].id} is missing model usage instructions`));
});

test("模型库质量门禁也校验非静态角色入口的使用说明", () => {
  const libraryWithoutCharacterUsage = MODEL_LIBRARY.map((entry) => (
    entry.id === "ual2-college-student" ? { ...entry, usage: undefined } : entry
  ));
  const errors = validateModelLibrary({ library: libraryWithoutCharacterUsage, modelsDir: MODELS_DIR });
  assert.ok(errors.includes("ual2-college-student is missing model usage instructions"));
});

test("模型库质量门禁拒绝互相矛盾的使用说明字段", () => {
  const libraryWithContradictoryUsage = MODEL_LIBRARY.map((entry, index) => (
    index === 0
      ? { ...entry, usage: { ...entry.usage, placementMode: "wall-mounted" } }
      : entry
  ));
  const errors = validateModelLibrary({ library: libraryWithContradictoryUsage, modelsDir: MODELS_DIR });
  assert.ok(errors.includes(`${MODEL_LIBRARY[0].id} wall-mounted usage must use wall/back/wall-facing semantics`));
  assert.ok(errors.includes(`${MODEL_LIBRARY[0].id} model usage surface does not match placement mode`));
});

test("目录中的 GLB 大小元数据与实际文件一致", () => {
  for (const entry of STATIC_MODEL_LIBRARY) {
    const actualSizeKb = Math.round(fs.statSync(path.join(MODELS_DIR, entry.fileName)).size / 1024);
    assert.equal(entry.sizeKb, actualSizeKb, `${entry.id}: catalog=${entry.sizeKb}KB actual=${actualSizeKb}KB`);
  }
});

test("清洗后的 fixture 没有悬空的 mesh 引用", () => {
  const fixture = makeSanitizerFixture();
  const cleaned = readGlb(stripUnsupportedGlb(fixture.buffer).buffer).json;
  assert.equal(
    (cleaned.nodes ?? []).some((node) => node.mesh !== undefined && !(node.mesh in cleaned.meshes)),
      false,
  );
});

test("GLB 清洗器同时移除无 mesh 的碰撞节点和高阶 LOD", () => {
  const fixture = makeSanitizerFixture();
  const result = stripUnsupportedGlb(fixture.buffer);
  assert.equal(result.changed, true);
  assert.deepEqual(readGlb(result.buffer).binChunk.data, fixture.bin);

  const cleaned = readGlb(result.buffer).json;
  const names = [
    ...(cleaned.nodes ?? []).map((node) => String(node.name ?? "")),
    ...(cleaned.meshes ?? []).map((mesh) => String(mesh.name ?? "")),
  ];
  assert.equal(names.some(hasUnsupportedName), false, names.join(", "));
  for (const node of cleaned.nodes ?? []) {
    if (node.mesh !== undefined) assert.ok(node.mesh >= 0 && node.mesh < cleaned.meshes.length);
  }
});

test("已发布餐桌 GLB 不再包含孤立碰撞节点", () => {
  const original = fs.readFileSync(path.join(MODELS_DIR, "SM_Table.glb"));
  const result = stripUnsupportedGlb(original);
  assert.equal(result.changed, false);
  assert.deepEqual(inspectGlb(original).unsupportedNames, []);
});
