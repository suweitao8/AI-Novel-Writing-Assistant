const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  UAL2_SIGNATURE,
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
  const neckPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === neckMaterialIndex,
  );
  const mainPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === materialNames.indexOf("M_Main"),
  );
  assert.ok(neckPrimitive);
  assert.ok(mainPrimitive);
  const generatedAccessorStart = Math.min(
    mainPrimitive.indices,
    neckPrimitive.indices,
  );
  const generatedBufferViewStart = Math.min(
    json.accessors[mainPrimitive.indices].bufferView,
    json.accessors[neckPrimitive.indices].bufferView,
  );
  assert.equal(generatedAccessorStart, json.accessors.length - 2);
  assert.equal(generatedBufferViewStart, json.bufferViews.length - 2);
  const originalBinLength = json.bufferViews[generatedBufferViewStart].byteOffset;
  json.accessors = json.accessors.slice(0, generatedAccessorStart);
  json.bufferViews = json.bufferViews.slice(0, generatedBufferViewStart);
  mannequin.primitives = mannequin.primitives.filter(
    (primitive) => primitive.material !== neckMaterialIndex,
  );
  mainPrimitive.indices = originalIndexAccessor;
  json.materials = json.materials.filter(
    (material) => material.name !== "M_Neck",
  );
  return serializeGlb(
    json,
    parsed.bin.subarray(0, originalBinLength),
    parsed.chunks,
  );
}

function appendUnsignedShortIndexAccessor(gltf, bin, templateAccessorIndex, indices) {
  const offset = (bin.length + 3) & ~3;
  const bytes = Buffer.alloc(indices.length * 2);
  indices.forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  const nextBin = Buffer.concat([bin, Buffer.alloc(offset - bin.length), bytes]);
  const bufferViewIndex = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: bytes.length,
    target: 34963,
  });
  const accessorIndex = gltf.accessors.length;
  const accessor = JSON.parse(
    JSON.stringify(gltf.accessors[templateAccessorIndex]),
  );
  delete accessor.byteOffset;
  delete accessor.sparse;
  accessor.bufferView = bufferViewIndex;
  accessor.componentType = 5123;
  accessor.count = indices.length;
  accessor.type = "SCALAR";
  accessor.min = indices.length > 0 ? [Math.min(...indices)] : undefined;
  accessor.max = indices.length > 0 ? [Math.max(...indices)] : undefined;
  gltf.accessors.push(accessor);
  return { bin: nextBin, accessorIndex };
}

function makeObsoleteNarrowRing(source) {
  const repaired = repairUal2Glb(source).buffer;
  const parsed = parseGlb(repaired);
  const json = JSON.parse(JSON.stringify(parsed.json));
  const materialNames = json.materials.map((material) => material.name);
  const mannequin = json.meshes.find((mesh) => mesh.name === "Mannequin");
  const main = mannequin.primitives.find(
    (primitive) => primitive.material === materialNames.indexOf("M_Main"),
  );
  const neck = mannequin.primitives.find(
    (primitive) => primitive.material === materialNames.indexOf("M_Neck"),
  );
  const bodyIndices = readGlbAccessor(json, parsed.bin, main.indices);
  const currentNeckIndices = readGlbAccessor(json, parsed.bin, neck.indices);
  const obsoleteNeckIndices = currentNeckIndices.slice(0, 174 * 3);
  const obsoleteBodyIndices = [
    ...bodyIndices,
    ...currentNeckIndices.slice(174 * 3),
  ];
  let bin = parsed.bin;
  const bodyAccessor = appendUnsignedShortIndexAccessor(
    json,
    bin,
    main.indices,
    obsoleteBodyIndices,
  );
  bin = bodyAccessor.bin;
  const neckAccessor = appendUnsignedShortIndexAccessor(
    json,
    bin,
    neck.indices,
    obsoleteNeckIndices,
  );
  bin = neckAccessor.bin;
  main.indices = bodyAccessor.accessorIndex;
  neck.indices = neckAccessor.accessorIndex;
  assert.equal(
    obsoleteBodyIndices.length + obsoleteNeckIndices.length,
    UAL2_SIGNATURE.mainIndexCount,
  );
  return serializeGlb(json, bin, parsed.chunks);
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

function getTriangleCoverage(positions, triangles) {
  return triangles.map(({ indices }) => {
    const vertices = indices.map((vertexIndex) => ({
      x: positions[vertexIndex * 3],
      y: positions[vertexIndex * 3 + 1],
      z: positions[vertexIndex * 3 + 2],
    }));
    return {
      maxRadial: Math.max(
        ...vertices.map((vertex) => Math.hypot(vertex.x, vertex.z)),
      ),
      centroidX:
        vertices.reduce((sum, vertex) => sum + vertex.x, 0) /
        vertices.length,
      centroidY:
        vertices.reduce((sum, vertex) => sum + vertex.y, 0) /
        vertices.length,
      centroidZ:
        vertices.reduce((sum, vertex) => sum + vertex.z, 0) /
        vertices.length,
    };
  });
}

function getAngularBin(centroidX, centroidZ, binCount) {
  const angle =
    (Math.atan2(centroidZ, centroidX) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(
    binCount - 1,
    Math.floor((angle / (Math.PI * 2)) * binCount),
  );
}

function getAnimationAndSkinAccessorIndices(gltf) {
  const accessorIndices = new Set();
  for (const animation of gltf.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      if (sampler.input !== undefined) accessorIndices.add(sampler.input);
      if (sampler.output !== undefined) accessorIndices.add(sampler.output);
    }
  }
  for (const skin of gltf.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) {
      accessorIndices.add(skin.inverseBindMatrices);
    }
  }
  return [...accessorIndices].sort((left, right) => left - right);
}

function assertAnimationAndSkinPayloadsUnchanged(original, repaired) {
  for (const accessorIndex of getAnimationAndSkinAccessorIndices(
    original.json,
  )) {
    assert.deepEqual(
      readGlbAccessor(original.json, original.bin, accessorIndex),
      readGlbAccessor(repaired.json, repaired.bin, accessorIndex),
      "动画或蒙皮二进制 accessor 被意外改写：" + accessorIndex,
    );
  }
}

for (const assetPath of assetPaths) {
  test(
    "checked-in UAL2 asset keeps the expanded outer neck partition: " +
      path.basename(assetPath),
    () => {
      const parsed = parseGlb(fs.readFileSync(assetPath));
      const signature = validateUal2Signature(parsed.json, {
        allowExisting: true,
      });
      const { main, joints, neck } = findPrimitives(parsed.json);
      assert.ok(main);
      assert.ok(joints);
      assert.ok(neck);
      assert.equal(
        parsed.json.accessors[neck.indices].count,
        342 * 3,
      );
      assert.equal(
        parsed.json.accessors[main.indices].count +
          parsed.json.accessors[neck.indices].count,
        UAL2_SIGNATURE.mainIndexCount,
      );
      assert.equal(
        parsed.json.accessors[joints.indices].count,
        UAL2_SIGNATURE.jointIndexCount,
      );
    },
  );

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
      const originalPositions = readGlbAccessor(
        original.json,
        original.bin,
        originalSignature.mainPositionAccessor,
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
      const neckCoverage = getTriangleCoverage(
        originalPositions,
        result.classification.selectedTriangles,
      );
      assert.ok(
        neckCoverage.length >= 300,
        "脖子材质必须覆盖完整的外轮廓，而不是只覆盖内侧窄环。",
      );
      assert.ok(
        Math.min(...neckCoverage.map((triangle) => triangle.centroidY)) <= 1.46,
        "脖子材质必须覆盖到颈部下缘。",
      );
      assert.ok(
        Math.max(...neckCoverage.map((triangle) => triangle.centroidY)) >= 1.61,
        "脖子材质必须覆盖到颈部上缘。",
      );
      assert.ok(
        Math.max(...neckCoverage.map((triangle) => triangle.maxRadial)) >= 0.21,
        "脖子材质必须覆盖到颈部外侧轮廓。",
      );
      const angularBinCounts = neckCoverage.reduce((counts, triangle) => {
        const bin = getAngularBin(
          triangle.centroidX,
          triangle.centroidZ,
          16,
        );
        counts[bin] = (counts[bin] ?? 0) + 1;
        return counts;
      }, {});
      assert.equal(Object.keys(angularBinCounts).length, 16);
      assert.ok(
        Math.min(...Object.values(angularBinCounts)) >= 15,
        "脖子材质的细分环向覆盖不能只在每个粗区间留下一个面片。",
      );
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
      assertAnimationAndSkinPayloadsUnchanged(original, repaired);
      assert.equal(repaired.json.nodes.length, original.json.nodes.length);
      assert.equal(
        repaired.json.materials.filter((material) => material.name === "M_Neck").length,
        1,
      );
    },
  );

  test(
    "checked-in UAL2 asset is deterministic output of the current neck generator: " +
      path.basename(assetPath),
    () => {
      const checkedIn = fs.readFileSync(assetPath);
      const source = makeOriginalFixture(assetPath);
      assert.deepEqual(repairUal2Glb(source).buffer, checkedIn);
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

test("repairUal2Glb refuses an obsolete narrow-ring repair even with allowExisting", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const obsolete = makeObsoleteNarrowRing(source);

  assert.throws(
    () => repairUal2Glb(obsolete, { allowExisting: true }),
    /脖子环带覆盖不完整|重新生成/,
  );
});

test("repairUal2Glb validates and reuses an existing repair when enabled", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const repaired = repairUal2Glb(source);
  const reused = repairUal2Glb(repaired.buffer, { allowExisting: true });

  assert.equal(reused.alreadyRepaired, true);
  assert.deepEqual(reused.buffer, repaired.buffer);
});
