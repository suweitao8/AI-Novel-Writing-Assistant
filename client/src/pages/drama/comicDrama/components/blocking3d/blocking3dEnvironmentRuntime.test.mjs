import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const runtimeSource = readFileSync(
  path.join(import.meta.dirname, "blocking3dEnvironmentRuntime.ts"),
  "utf8",
);

function renderOptionsFor(entityName) {
  const match = runtimeSource.match(
    new RegExp(`${entityName}\\.addComponent\\(\\"render\\", \\{([\\s\\S]*?)\\n\\s*\\}\\);`),
  );
  assert.ok(match, `${entityName} 应创建 render 组件`);
  return match[1];
}

test("HDRI 可视穹顶和阴影接收地面都只接收阴影而不投射阴影", () => {
  for (const entityName of ["environmentBackdrop", "environmentShadowCatcher"]) {
    const renderOptions = renderOptionsFor(entityName);
    assert.match(renderOptions, /castShadows:\s*false/);
    assert.match(renderOptions, /receiveShadows:\s*true/);
  }
});
