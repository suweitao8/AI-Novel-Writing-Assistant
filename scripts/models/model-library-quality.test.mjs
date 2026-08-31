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
  CINE57_MAX_FOOD_CONTAINER_ENTRIES,
  CINE57_MINIMUM_MODEL_COUNT,
  CINE57_REMOVED_MODEL_IDS,
  CINE57_REQUIRED_CATEGORIES,
  isFoodContainerModel,
} from "./modelLibraryPolicy.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_DIR = path.join(REPO_ROOT, "client/public/models/cine57");
const REMOVED_IDS = new Set(CINE57_REMOVED_MODEL_IDS);
const REQUIRED_FINE_GRAINED_CATEGORIES = CINE57_REQUIRED_CATEGORIES;
const STATIC_MODEL_LIBRARY = MODEL_LIBRARY.filter((entry) => entry.fileUrl.startsWith("/models/cine57/"));

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

test("Cine57 目录只发布前景交互资产，其他来源的角色入口独立计数", () => {
  assert.ok(STATIC_MODEL_LIBRARY.length >= CINE57_MINIMUM_MODEL_COUNT, `expected expanded library, found ${STATIC_MODEL_LIBRARY.length}`);
  assert.equal(MODEL_LIBRARY.length - STATIC_MODEL_LIBRARY.length, 1);
  assert.equal(MODEL_LIBRARY.find((entry) => entry.id === "ual2-college-student")?.category, "角色");
  assert.deepEqual(
    STATIC_MODEL_LIBRARY.filter((entry) => REMOVED_IDS.has(entry.id)).map((entry) => entry.id),
    [],
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
    entry.id === "grass-02-a-1"
      ? {
        ...entry,
        materials: {
          MI_grass_02: {
            ...entry.materials.MI_grass_02,
            baseColor: "https://example.invalid/grass.png",
          },
        },
      }
      : entry
  ));
  const errors = validateModelLibrary({ library: libraryWithExternalTexture, modelsDir: MODELS_DIR });
  assert.ok(errors.includes(
    "grass-02-a-1 MI_grass_02 baseColor texture is missing: https://example.invalid/grass.png",
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
