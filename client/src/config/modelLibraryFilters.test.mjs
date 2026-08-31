import assert from "node:assert/strict";
import test from "node:test";

import { MODEL_LIBRARY } from "./modelLibrary.ts";

test("模型目录隐藏角色资源，并支持名称、文件名和分类搜索", async () => {
  const { filterModelLibraryEntries } = await import("./modelLibraryFilters.ts");

  const visibleEntries = filterModelLibraryEntries(MODEL_LIBRARY);
  assert.ok(visibleEntries.length > 0);
  assert.equal(visibleEntries.some((entry) => entry.category === "角色"), false);
  assert.equal(
    visibleEntries.length,
    MODEL_LIBRARY.filter((entry) => entry.category !== "角色").length,
  );

  const nameTarget = visibleEntries[0];
  assert.deepEqual(
    filterModelLibraryEntries(MODEL_LIBRARY, nameTarget.name).map((entry) => entry.id),
    [nameTarget.id],
  );
  assert.deepEqual(
    filterModelLibraryEntries(MODEL_LIBRARY, nameTarget.fileName.toLowerCase()).map((entry) => entry.id),
    [nameTarget.id],
  );
  assert.ok(filterModelLibraryEntries(MODEL_LIBRARY, nameTarget.category).length > 1);
  assert.deepEqual(filterModelLibraryEntries(MODEL_LIBRARY, "没有这个资产").length, 0);
});
