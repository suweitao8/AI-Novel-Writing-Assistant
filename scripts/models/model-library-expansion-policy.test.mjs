import assert from "node:assert/strict";
import test from "node:test";

import {
  CINE57_MAXIMUM_NEW_ASSET_COUNT,
  CINE57_MINIMUM_NEW_ASSET_COUNT,
  CINE57_MINIMUM_NEW_ASSETS_BY_CATEGORY,
  CINE57_MODEL_LIBRARY_POLICY,
} from "./modelLibraryPolicy.mjs";

test("现代日常扩容策略声明数量区间与高频分类配额", () => {
  const newAssets = CINE57_MODEL_LIBRARY_POLICY.newAssets;
  assert.ok(Number.isInteger(CINE57_MINIMUM_NEW_ASSET_COUNT));
  assert.ok(Number.isInteger(CINE57_MAXIMUM_NEW_ASSET_COUNT));
  assert.ok(newAssets.length >= CINE57_MINIMUM_NEW_ASSET_COUNT);
  assert.ok(newAssets.length <= CINE57_MAXIMUM_NEW_ASSET_COUNT);
  for (const [category, minimum] of Object.entries(CINE57_MINIMUM_NEW_ASSETS_BY_CATEGORY)) {
    assert.ok(
      newAssets.filter((asset) => asset.category === category).length >= minimum,
      `${category}: expected at least ${minimum} new assets`,
    );
  }
});

test("扩容策略为每个候选声明来源、族和用途优先级", () => {
  for (const asset of CINE57_MODEL_LIBRARY_POLICY.newAssets) {
    assert.match(asset.meshName, /^(?:SM_|sm_|KB3D_)/);
    assert.match(asset.package, /^\/Game\//);
    assert.match(asset.familyKey, /\S/);
    assert.match(asset.priority, /^P[0-2]$/);
    assert.match(asset.variantReason, /\S/);
  }
});
