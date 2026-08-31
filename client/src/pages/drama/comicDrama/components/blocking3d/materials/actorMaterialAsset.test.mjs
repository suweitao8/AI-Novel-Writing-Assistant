import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const actorAssetPaths = [
  path.resolve(
    import.meta.dirname,
    "../../../../../../../public/anims/cine57/UAL2_UE_Anims.glb",
  ),
  path.resolve(
    import.meta.dirname,
    "../../../../../../../public/viewer-kit/quaternius/ual2/UAL2_Standard.glb",
  ),
];

function readGlb(filePath) {
  const glb = readFileSync(filePath);
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);

  const jsonChunkLength = glb.readUInt32LE(12);
  const jsonChunkType = glb.readUInt32LE(16);
  assert.equal(jsonChunkType, 0x4e4f534a);
  const json = JSON.parse(
    glb.subarray(20, 20 + jsonChunkLength).toString("utf8").trim(),
  );

  const binHeaderOffset = 20 + jsonChunkLength;
  const binChunkLength = glb.readUInt32LE(binHeaderOffset);
  const binChunkType = glb.readUInt32LE(binHeaderOffset + 4);
  assert.equal(binChunkType, 0x004e4942);

  return {
    json,
    bin: glb.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binChunkLength),
  };
}

function readAccessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const componentsByType = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const componentBytesByType = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  const components = componentsByType[accessor.type];
  const componentBytes = componentBytesByType[accessor.componentType];
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count * components; index += 1) {
    const offset = start + index * componentBytes;
    if (accessor.componentType === 5121) values.push(bin.readUInt8(offset));
    else if (accessor.componentType === 5123) values.push(bin.readUInt16LE(offset));
    else if (accessor.componentType === 5125) values.push(bin.readUInt32LE(offset));
    else if (accessor.componentType === 5126) values.push(bin.readFloatLE(offset));
    else throw new Error("Unsupported component type " + accessor.componentType);
  }
  return values;
}

function angularBins(gltf, bin, primitive) {
  const positions = readAccessor(gltf, bin, primitive.attributes.POSITION);
  const indices = readAccessor(gltf, bin, primitive.indices);
  const bins = new Set();
  for (let index = 0; index < indices.length; index += 3) {
    const vertexIndices = indices.slice(index, index + 3);
    const x =
      (positions[vertexIndices[0] * 3] +
        positions[vertexIndices[1] * 3] +
        positions[vertexIndices[2] * 3]) /
      3;
    const z =
      (positions[vertexIndices[0] * 3 + 2] +
        positions[vertexIndices[1] * 3 + 2] +
        positions[vertexIndices[2] * 3 + 2]) /
      3;
    const normalizedAngle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    bins.add(Math.min(15, Math.floor((normalizedAngle / (Math.PI * 2)) * 16)));
  }
  return bins;
}

for (const actorAssetPath of actorAssetPaths) {
  test(
    "UAL2 角色资源包含连续脖子环带材质分区：" + path.basename(actorAssetPath),
    () => {
      const { json: gltf, bin } = readGlb(actorAssetPath);
      const materialNames = (gltf.materials ?? []).map((material) => material.name);
      const mainMaterialIndex = materialNames.indexOf("M_Main");
      const jointMaterialIndex = materialNames.indexOf("M_Joints");
      const neckMaterialIndex = materialNames.indexOf("M_Neck");

      assert.notEqual(mainMaterialIndex, -1);
      assert.notEqual(jointMaterialIndex, -1);
      assert.notEqual(neckMaterialIndex, -1);
      assert.equal(
        materialNames.filter((name) => name === "M_Neck").length,
        1,
      );

      const mannequin = (gltf.meshes ?? []).find(
        (mesh) => mesh.name === "Mannequin",
      );
      assert.ok(mannequin);
      const mainPrimitive = mannequin.primitives.find(
        (primitive) => primitive.material === mainMaterialIndex,
      );
      const neckPrimitive = mannequin.primitives.find(
        (primitive) => primitive.material === neckMaterialIndex,
      );
      const jointPrimitive = mannequin.primitives.find(
        (primitive) => primitive.material === jointMaterialIndex,
      );

      assert.ok(mainPrimitive);
      assert.ok(neckPrimitive);
      assert.ok(jointPrimitive);
      assert.ok(neckPrimitive.indices !== undefined);
      assert.ok(mainPrimitive.indices !== undefined);
      assert.equal(
        gltf.accessors[mainPrimitive.indices].count +
          gltf.accessors[neckPrimitive.indices].count,
        17196,
      );
      assert.equal(gltf.accessors[jointPrimitive.indices].count, 24036);
      assert.equal(gltf.skins?.[0]?.joints?.length, 65);
      assert.equal(angularBins(gltf, bin, neckPrimitive).size, 16);
    },
  );
}
