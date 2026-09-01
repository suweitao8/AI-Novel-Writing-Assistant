import assert from "node:assert/strict";
import test from "node:test";
import * as pc from "playcanvas";

import {
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  getBlocking3dActorJointColor,
} from "./actorMaterialPolicy.ts";
import { setEntityMaterial } from "./actorMaterialRuntime.ts";

function createEntity(renderMeshes, modelMeshes = []) {
  return {
    findComponents(type) {
      return type === "render"
        ? [{ meshInstances: renderMeshes }]
        : type === "model"
          ? [{ meshInstances: modelMeshes }]
          : [];
    },
  };
}

function readDiffuse(material) {
  return [material.diffuse.r, material.diffuse.g, material.diffuse.b];
}

test("M_Neck 使用主体蓝色，M_Joints 保留淡蓝色高亮并同步换色", () => {
  const mainMesh = { material: { name: "M_Main" } };
  const jointMesh = { material: { name: "M_Joints" } };
  const neckMesh = { material: { name: "M_Neck" } };
  const entity = createEntity([mainMesh, jointMesh, neckMesh]);

  const mainMaterial = setEntityMaterial(entity, BLOCKING_3D_BLUE_ACTOR_COLOR);
  const jointMaterial = jointMesh.material;

  assert.equal(mainMesh.material, mainMaterial);
  assert.notEqual(jointMaterial, mainMaterial);
  assert.equal(neckMesh.material, mainMaterial);
  assert.deepEqual(
    readDiffuse(jointMaterial),
    getBlocking3dActorJointColor(BLOCKING_3D_BLUE_ACTOR_COLOR),
  );

  const nextColor = [0.72, 0.18, 0.28];
  setEntityMaterial(entity, nextColor, mainMaterial);

  assert.equal(mainMesh.material, mainMaterial);
  assert.equal(jointMesh.material, jointMaterial);
  assert.equal(neckMesh.material, mainMaterial);
  assert.deepEqual(readDiffuse(mainMaterial), nextColor);
  assert.deepEqual(readDiffuse(jointMaterial), getBlocking3dActorJointColor(nextColor));
});

test("没有 M_Joints 材质槽时回退为单一主体材质", () => {
  const mainMesh = { material: { name: "M_Main" } };
  const entity = createEntity([], [mainMesh]);
  const mainMaterial = setEntityMaterial(entity, BLOCKING_3D_BLUE_ACTOR_COLOR);

  assert.equal(mainMesh.material, mainMaterial);
  assert.ok(mainMaterial instanceof pc.StandardMaterial);
});
