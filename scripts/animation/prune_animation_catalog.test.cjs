const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  pruneAnimations,
  readGlb,
  writeGlb,
} = require("./prune_animation_catalog.cjs");

test("动画基础包剪枝只移除指定前缀并压缩掉未引用的动画数据", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "animation-catalog-prune-"));
  const inputPath = path.join(tempDir, "input.glb");
  const outputPath = path.join(tempDir, "output.glb");
  const sourceJson = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 12 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: 4 },
      { buffer: 0, byteOffset: 8, byteLength: 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 1, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 1, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 1, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    animations: [
      { name: "Idle_No_Loop", samplers: [{ input: 1, output: 1 }], channels: [] },
      { name: "C57_old_attack", samplers: [{ input: 2, output: 2 }], channels: [] },
      { name: "A_INP_WalkFwd_Loop", samplers: [{ input: 1, output: 1 }], channels: [] },
    ],
  };
  const sourceBinary = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  writeGlb(inputPath, sourceJson, sourceBinary);

  const result = pruneAnimations(
    inputPath,
    outputPath,
    (animation) => !animation.name.startsWith("C57_"),
  );
  const output = readGlb(outputPath);
  assert.equal(result.originalAnimationCount, 3);
  assert.equal(result.removedAnimationCount, 1);
  assert.deepEqual(
    output.json.animations.map((animation) => animation.name),
    ["Idle_No_Loop", "A_INP_WalkFwd_Loop"],
  );
  assert.equal(Object.hasOwn(output.json.meshes[0].primitives[0], "targets"), false);
  assert.deepEqual([...output.binary], [1, 2, 3, 4, 5, 6, 7, 8]);
});
