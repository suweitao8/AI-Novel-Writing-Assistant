const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  parseGlb,
  readGlbAccessor,
  repairUal2Glb,
  serializeGlb,
  validateUal2Signature,
} = require("./repair_ual2_neck_material.cjs");

const assetPaths = [
  path.resolve("client/public/anims/cine57/UAL2_UE_Anims.glb"),
  path.resolve("client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb"),
];

function findPrimitives(gltf) {
  const materialNames = (gltf.materials ?? []).map((material) => material.name);
  const mannequin = (gltf.meshes ?? []).find(
    (mesh) => mesh.name === "Mannequin",
  );
  assert.ok(mannequin);
  return {
    main: mannequin.primitives.find(
      (primitive) => primitive.material === materialNames.indexOf("M_Main"),
    ),
    joints: mannequin.primitives.find(
      (primitive) => primitive.material === materialNames.indexOf("M_Joints"),
    ),
    neck: mannequin.primitives.find(
      (primitive) => primitive.material === materialNames.indexOf("M_Neck"),
    ),
  };
}

function makeOriginalFixture(assetPath) {
  const parsed = parseGlb(fs.readFileSync(assetPath));
  const json = JSON.parse(JSON.stringify(parsed.json));
  const materialNames = json.materials.map((material) => material.name);
  const neckMaterialIndex = materialNames.indexOf("M_Neck");
  const originalIndexAccessor = json.accessors.findIndex(
    (accessor) =>
      accessor.type === "SCALAR" &&
      accessor.componentType === 5123 &&
      accessor.count === 17196,
  );
  assert.ok(neckMaterialIndex >= 0);
  assert.notEqual(originalIndexAccessor, -1);

  const mannequin = json.meshes.find((mesh) => mesh.name === "Mannequin");
  assert.ok(mannequin);
  mannequin.primitives = mannequin.primitives.filter(
    (primitive) => primitive.material !== neckMaterialIndex,
  );
  const main = mannequin.primitives.find(
    (primitive) => primitive.material === materialNames.indexOf("M_Main"),
  );
  assert.ok(main);
  main.indices = originalIndexAccessor;
  json.materials = json.materials.filter(
    (material) => material.name !== "M_Neck",
  );
  return serializeGlb(json, parsed.bin, parsed.chunks);
}

function triangleMultiset(indices) {
  const counts = new Map();
  for (let index = 0; index < indices.length; index += 3) {
    const key = indices.slice(index, index + 3).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function assertPartition(originalIndices, bodyIndices, neckIndices) {
  const original = triangleMultiset(originalIndices);
  const partition = triangleMultiset([...bodyIndices, ...neckIndices]);
  assert.deepEqual(partition, original);
  const body = new Set(
    Array.from(triangleMultiset(bodyIndices).keys()),
  );
  const neck = new Set(
    Array.from(triangleMultiset(neckIndices).keys()),
  );
  assert.equal(
    Array.from(body).some((triangle) => neck.has(triangle)),
    false,
  );
}

for (const assetPath of assetPaths) {
  test(
    "repairUal2Glb splits the outer neck without changing UAL2 animation data: " +
      path.basename(assetPath),
    () => {
      const source = makeOriginalFixture(assetPath);
      const original = parseGlb(source);
      const originalSignature = validateUal2Signature(original.json);
      const originalMainIndices = readGlbAccessor(
        original.json,
        original.bin,
        originalSignature.mainIndexAccessor,
      );
      const result = repairUal2Glb(source);
      const repaired = parseGlb(result.buffer);
      const { main, joints, neck } = findPrimitives(repaired.json);
      assert.ok(main);
      assert.ok(joints);
      assert.ok(neck);
      assert.equal(result.classification.angularBins.size, 16);
      assert.ok(result.classification.neckIndices.length > 0);
      assert.ok(result.classification.bodyIndices.length > 0);
      assertPartition(
        originalMainIndices,
        result.classification.bodyIndices,
        result.classification.neckIndices,
      );

      assert.equal(
        repaired.json.accessors[main.indices].count +
          repaired.json.accessors[neck.indices].count,
        originalMainIndices.length,
      );
      assert.equal(
        repaired.json.accessors[joints.indices].count,
        original.json.accessors[originalSignature.jointIndexAccessor].count,
      );
      assert.deepEqual(
        repaired.json.meshes.find((mesh) => mesh.name === "Mannequin").primitives[1],
        original.json.meshes.find((mesh) => mesh.name === "Mannequin").primitives[1],
      );
      assert.deepEqual(repaired.json.skins, original.json.skins);
      assert.deepEqual(repaired.json.animations ?? [], original.json.animations ?? []);
      assert.equal(repaired.json.nodes.length, original.json.nodes.length);
      assert.equal(
        repaired.json.materials.filter((material) => material.name === "M_Neck").length,
        1,
      );
    },
  );
}

test("repairUal2Glb refuses an unknown vertex signature", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const parsed = parseGlb(source);
  const mutated = JSON.parse(JSON.stringify(parsed.json));
  mutated.accessors[0].count -= 1;
  const malformedSignature = serializeGlb(mutated, parsed.bin, parsed.chunks);

  assert.throws(
    () => repairUal2Glb(malformedSignature),
    /签名不符/,
  );
});

test("repairUal2Glb refuses to repair a resource twice by default", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const repaired = repairUal2Glb(source);

  assert.throws(
    () => repairUal2Glb(repaired.buffer),
    /已经包含 M_Neck/,
  );
});

test("repairUal2Glb validates and reuses an existing repair when enabled", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const repaired = repairUal2Glb(source);
  const reused = repairUal2Glb(repaired.buffer, { allowExisting: true });

  assert.equal(reused.alreadyRepaired, true);
  assert.deepEqual(reused.buffer, repaired.buffer);
});
