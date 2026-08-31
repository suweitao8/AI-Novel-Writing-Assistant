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

test("环境运行时只在仍拥有当前 atlas 时恢复环境强度", () => {
  assert.match(
    runtimeSource,
    /const initialSceneSkyboxIntensity\s*=\s*app\.scene\.skyboxIntensity/,
  );
  assert.match(
    runtimeSource,
    /app\.scene\.skyboxIntensity\s*=\s*lighting\.skyboxIntensity/,
  );
  assert.match(
    runtimeSource,
    /if\s*\(ownsEnvironmentLighting\)\s*app\.scene\.skyboxIntensity\s*=\s*initialSceneSkyboxIntensity/,
  );
});

test("环境运行时让主光、可见 HDRI 与 EnvAtlas 共用方位偏移，并恢复场景旋转", () => {
  assert.match(
    runtimeSource,
    /const initialSceneSkyboxRotation\s*=\s*app\.scene\.skyboxRotation\.clone\(\)/,
  );
  assert.match(
    runtimeSource,
    /createHdriEnvironmentRotation\(\s*lighting\.hdriAzimuthOffsetDegrees\s*,\s*\)/,
  );
  assert.match(runtimeSource, /app\.scene\.skyboxRotation\s*=\s*environmentSceneSkyboxRotation/);
  assert.match(runtimeSource, /app\.scene\.skyboxRotation\s*=\s*initialSceneSkyboxRotation/);
  assert.match(runtimeSource, /hdriAzimuthOffsetDegrees/);
  assert.match(runtimeSource, /hdriAzimuthOffsetDegrees:\s*lighting\.hdriAzimuthOffsetDegrees/);
});
