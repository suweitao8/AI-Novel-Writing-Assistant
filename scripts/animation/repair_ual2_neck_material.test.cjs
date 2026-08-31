const { execFileSync } = require("node:child_process");
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
  path.resolve(__dirname, "../../client/public/anims/cine57/UAL2_UE_Anims.glb"),
  path.resolve(
    __dirname,
    "../../client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb",
  ),
];
const repositoryRoot = path.resolve(__dirname, "../..");
const canonicalSourceCommit =
  "d363c614c3e23de231d4644b50f9156e00a1a3d0";
const canonicalSourceCache = new Map();

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
  const relativePath = path
    .relative(repositoryRoot, assetPath)
    .replaceAll(path.sep, "/");
  if (!canonicalSourceCache.has(relativePath)) {
    canonicalSourceCache.set(
      relativePath,
      execFileSync(
        "git",
        ["show", canonicalSourceCommit + ":" + relativePath],
        {
          cwd: repositoryRoot,
          maxBuffer: 64 * 1024 * 1024,
        },
      ),
    );
  }
  return Buffer.from(canonicalSourceCache.get(relativePath));
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

function mutateExistingAsset(assetPath, mutate) {
  const parsed = parseGlb(fs.readFileSync(assetPath));
  const json = JSON.parse(JSON.stringify(parsed.json));
  const signature = validateUal2Signature(json, { allowExisting: true });
  const bin = Buffer.from(parsed.bin);
  mutate({ json, bin, signature });
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
        UAL2_SIGNATURE.neckIndexCount,
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
      const reused = repairUal2Glb(fs.readFileSync(assetPath), {
        allowExisting: true,
      });
      assert.equal(reused.alreadyRepaired, true);
      assert.deepEqual(reused.buffer, fs.readFileSync(assetPath));
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

test("repairUal2Glb refuses a corrupted existing M_Main partition", () => {
  const corrupted = mutateExistingAsset(assetPaths[0], ({ json, bin }) => {
    const materialNames = json.materials.map((material) => material.name);
    const mannequin = json.meshes.find((mesh) => mesh.name === "Mannequin");
    const main = mannequin.primitives.find(
      (primitive) => primitive.material === materialNames.indexOf("M_Main"),
    );
    const indices = readGlbAccessor(json, bin, main.indices);
    indices[0] = (indices[0] + 1) % UAL2_SIGNATURE.mainVertexCount;
    const accessor = json.accessors[main.indices];
    const bufferView = json.bufferViews[accessor.bufferView];
    const byteOffset =
      (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    bin.writeUInt16LE(indices[0], byteOffset);
  });

  assert.throws(
    () => repairUal2Glb(corrupted, { allowExisting: true }),
    /几何指纹/,
  );
});

test("repairUal2Glb refuses an existing repair with altered POSITION data", () => {
  const corrupted = mutateExistingAsset(assetPaths[0], ({
    json,
    bin,
    signature,
  }) => {
    const accessor = json.accessors[signature.mainPositionAccessor];
    const bufferView = json.bufferViews[accessor.bufferView];
    const byteOffset =
      (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    bin.writeFloatLE(bin.readFloatLE(byteOffset) + 0.000001, byteOffset);
  });

  assert.throws(
    () => repairUal2Glb(corrupted, { allowExisting: true }),
    /几何指纹/,
  );
});

test("repairUal2Glb refuses an existing repair with altered M_Neck material", () => {
  const corrupted = mutateExistingAsset(assetPaths[0], ({
    json,
  }) => {
    const neckMaterial = json.materials.find(
      (material) => material.name === "M_Neck",
    );
    neckMaterial.pbrMetallicRoughness.baseColorFactor[0] = 0.01;
  });

  assert.throws(
    () => repairUal2Glb(corrupted, { allowExisting: true }),
    /M_Neck 材质契约/,
  );
});

test("repairUal2Glb refuses an existing repair with altered skin attributes", () => {
  const corrupted = mutateExistingAsset(assetPaths[0], ({
    json,
  }) => {
    const materialNames = json.materials.map((material) => material.name);
    const mannequin = json.meshes.find((mesh) => mesh.name === "Mannequin");
    const neck = mannequin.primitives.find(
      (primitive) => primitive.material === materialNames.indexOf("M_Neck"),
    );
    neck.attributes.JOINTS_0 = neck.attributes.NORMAL;
  });

  assert.throws(
    () => repairUal2Glb(corrupted, { allowExisting: true }),
    /属性映射/,
  );
});

test("repairUal2Glb validates and reuses an existing repair when enabled", () => {
  const source = makeOriginalFixture(assetPaths[0]);
  const repaired = repairUal2Glb(source);
  const reused = repairUal2Glb(repaired.buffer, { allowExisting: true });

  assert.equal(reused.alreadyRepaired, true);
  assert.deepEqual(reused.buffer, repaired.buffer);
});
