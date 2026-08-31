import * as pc from "playcanvas";

import {
  getBlocking3dActorJointColor,
  getBlocking3dActorMaterialRole,
  type Blocking3dActorColor,
  type Blocking3dActorMaterialRole,
} from "./actorMaterialPolicy.ts";

export {
  BLOCKING_3D_ACTOR_JOINT_HIGHLIGHT_RATIO,
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  BLOCKING_3D_JOINT_MATERIAL_NAME,
  BLOCKING_3D_NECK_MATERIAL_NAME,
  getBlocking3dActorJointColor,
  getBlocking3dActorMaterialRole,
} from "./actorMaterialPolicy.ts";
export type {
  Blocking3dActorColor,
  Blocking3dActorMaterialRole,
} from "./actorMaterialPolicy.ts";

const JOINT_MATERIAL_BY_MAIN = new WeakMap<pc.StandardMaterial, pc.StandardMaterial>();
const MATERIAL_ROLE_BY_MESH = new WeakMap<pc.MeshInstance, Blocking3dActorMaterialRole>();

function configureActorMaterial(
  material: pc.StandardMaterial,
  color: Blocking3dActorColor,
): void {
  material.diffuse = new pc.Color(color[0], color[1], color[2]);
  material.metalness = 0;
  material.useLighting = true;
  material.useSkybox = true;
  material.update();
}

function getJointMaterial(
  mainMaterial: pc.StandardMaterial,
  color: Blocking3dActorColor,
): pc.StandardMaterial {
  let jointMaterial = JOINT_MATERIAL_BY_MAIN.get(mainMaterial);
  if (!jointMaterial) {
    jointMaterial = new pc.StandardMaterial();
    JOINT_MATERIAL_BY_MAIN.set(mainMaterial, jointMaterial);
  }
  configureActorMaterial(jointMaterial, getBlocking3dActorJointColor(color));
  return jointMaterial;
}

function applyMaterialToMesh(
  mesh: pc.MeshInstance,
  material: pc.StandardMaterial,
  jointMaterial: pc.StandardMaterial,
): void {
  let role = MATERIAL_ROLE_BY_MESH.get(mesh);
  if (!role) {
    role = getBlocking3dActorMaterialRole(mesh.material?.name);
    MATERIAL_ROLE_BY_MESH.set(mesh, role);
  }
  mesh.material = role === "main" ? material : jointMaterial;
}

export function setEntityMaterial(
  entity: pc.Entity,
  color: Blocking3dActorColor,
  material = new pc.StandardMaterial(),
): pc.StandardMaterial {
  configureActorMaterial(material, color);
  const jointMaterial = getJointMaterial(material, color);

  for (const render of entity.findComponents(
    "render",
  ) as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) {
      applyMaterialToMesh(mesh, material, jointMaterial);
    }
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) {
      applyMaterialToMesh(mesh, material, jointMaterial);
    }
  }
  return material;
}
