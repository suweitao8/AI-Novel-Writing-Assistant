import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  getBlocking3dActorJointColor,
  getBlocking3dActorMaterialRole,
} from "./actorMaterialPolicy.ts";

test("蓝色代理角色的关节颜色更亮且保留蓝色倾向", () => {
  const joint = getBlocking3dActorJointColor(BLOCKING_3D_BLUE_ACTOR_COLOR);

  assert.ok(
    joint.every((channel, index) => channel > BLOCKING_3D_BLUE_ACTOR_COLOR[index]),
  );
  assert.ok(joint[2] > joint[1] && joint[1] > joint[0]);
});

test("只把 M_Joints 材质槽识别为关节", () => {
  assert.equal(getBlocking3dActorMaterialRole(" M_Joints "), "joints");
  assert.equal(getBlocking3dActorMaterialRole("M_Main"), "main");
  assert.equal(getBlocking3dActorMaterialRole(undefined), "main");
});
