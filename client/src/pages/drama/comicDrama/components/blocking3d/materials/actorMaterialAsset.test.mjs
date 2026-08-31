import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const actorAssetPath = path.resolve(
  import.meta.dirname,
  "../../../../../../../public/anims/cine57/UAL2_UE_Anims.glb",
);

function readGlbJson(filePath) {
  const glb = readFileSync(filePath);
  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);

  const jsonChunkLength = glb.readUInt32LE(12);
  const jsonChunkType = glb.readUInt32LE(16);
  assert.equal(jsonChunkType, 0x4e4f534a);

  return JSON.parse(
    glb.subarray(20, 20 + jsonChunkLength).toString("utf8").trim(),
  );
}

test("UAL2 角色 GLB 保留主体与关节材质槽", () => {
  const gltf = readGlbJson(actorAssetPath);
  const materialNames = (gltf.materials ?? []).map((material) => material.name);
  const mainMaterialIndex = materialNames.indexOf("M_Main");
  const jointMaterialIndex = materialNames.indexOf("M_Joints");

  assert.notEqual(mainMaterialIndex, -1);
  assert.notEqual(jointMaterialIndex, -1);

  const mannequin = (gltf.meshes ?? []).find(
    (mesh) => mesh.name === "Mannequin",
  );
  assert.ok(mannequin);
  const primitiveMaterialIndices = (mannequin.primitives ?? []).map(
    (primitive) => primitive.material,
  );
  assert.ok(primitiveMaterialIndices.includes(mainMaterialIndex));
  assert.ok(primitiveMaterialIndices.includes(jointMaterialIndex));
});
