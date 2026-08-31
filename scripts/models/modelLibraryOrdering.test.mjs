import assert from "node:assert/strict";
import test from "node:test";

import { orderModelEntries } from "./modelLibraryOrdering.mjs";

const staticUrl = (id) => `/models/cine57/${id}.glb`;

test("静态模型按分类排序且保留分类内相对顺序，非静态资源置于末尾", () => {
  const entries = [
    { id: "furniture-first", category: "家具", fileUrl: staticUrl("furniture-first") },
    { id: "character", category: "角色", fileUrl: "/anims/cine57/UAL2_UE_Anims.glb" },
    { id: "container", category: "容器与箱子", fileUrl: staticUrl("container") },
    { id: "furniture-second", category: "家具", fileUrl: staticUrl("furniture-second") },
  ];

  assert.deepEqual(
    orderModelEntries(entries, {
      categoryOrder: ["家具", "容器与箱子"],
      staticUrlPrefix: "/models/cine57/",
    }).map((entry) => entry.id),
    ["furniture-first", "furniture-second", "container", "character"],
  );
});

test("静态模型使用未知分类时明确失败", () => {
  assert.throws(
    () => orderModelEntries([
      { id: "unknown", category: "未定义分类", fileUrl: staticUrl("unknown") },
    ], {
      categoryOrder: ["家具"],
      staticUrlPrefix: "/models/cine57/",
    }),
    /unknown model category.*unknown.*未定义分类/,
  );
});
