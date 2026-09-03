import assert from "node:assert/strict";
import test from "node:test";
import * as pc from "playcanvas";

import { applyModelMaterialCulling } from "./modelMaterialPolicy.ts";

test("透明镂空贴图材质启用双面渲染", () => {
  const material = new pc.StandardMaterial();
  applyModelMaterialCulling(material, { opacity: "/models/cine57/tex/grass.png" });
  assert.equal(material.cull, pc.CULLFACE_NONE);
});
test("没有有效透明贴图的材质保持单面渲染", () => {
  for (const info of [undefined, {}, { opacity: "  " }]) {
    const material = new pc.StandardMaterial();
    applyModelMaterialCulling(material, info);
    assert.equal(material.cull, pc.CULLFACE_BACK);
  }
});
