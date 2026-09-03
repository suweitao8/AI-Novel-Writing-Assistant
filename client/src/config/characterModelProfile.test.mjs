import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCharacterModelProfile,
} from "../../../shared/types/characterModelProfile.ts";

test("显式模型覆盖优先于角色性别和体型", () => {
  assert.equal(
    resolveCharacterModelProfile({
      gender: "female",
      bodyBuild: "slender",
      modelProfileOverride: "manny",
    }),
    "manny",
  );
  assert.equal(
    resolveCharacterModelProfile({
      gender: "male",
      bodyBuild: "broad",
      modelProfileOverride: "quinn",
    }),
    "quinn",
  );
});

test("人类性别与非人角色体型路由到 UE5 默认模型", () => {
  assert.equal(resolveCharacterModelProfile({ gender: "female" }), "quinn");
  assert.equal(resolveCharacterModelProfile({ gender: "male" }), "manny");
  assert.equal(
    resolveCharacterModelProfile({ actorKind: "monster", bodyBuild: "broad" }),
    "manny",
  );
  assert.equal(
    resolveCharacterModelProfile({ actorKind: "monster", bodyBuild: "slender" }),
    "quinn",
  );
  assert.equal(resolveCharacterModelProfile({ gender: "unknown" }), "manny");
});

test("自由文本体态不会绕过结构化体型合同", () => {
  assert.equal(
    resolveCharacterModelProfile({
      gender: "unknown",
      physique: "魁梧高大的巨人",
    }),
    "manny",
  );
  assert.equal(
    resolveCharacterModelProfile({
      gender: "unknown",
      physique: "纤细瘦小的精灵",
    }),
    "manny",
  );
});
