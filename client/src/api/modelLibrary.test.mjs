import assert from "node:assert/strict";
import test from "node:test";

import { parseModelLibraryVisibilityResponse } from "./modelLibraryVisibility.ts";

test("模型库可见性响应必须显式返回字符串 ID 数组", () => {
  assert.deepEqual(
    parseModelLibraryVisibilityResponse({ success: true, data: { hiddenModelIds: ["bed-12a"] } }),
    { success: true, data: { hiddenModelIds: ["bed-12a"] } },
  );
  assert.throws(
    () => parseModelLibraryVisibilityResponse({ success: true, data: {} }),
    /模型库可见性响应格式无效/,
  );
  assert.throws(
    () => parseModelLibraryVisibilityResponse({ success: true, data: { hiddenModelIds: ["bed-12a", 42] } }),
    /模型库可见性响应格式无效/,
  );
});
