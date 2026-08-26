import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../src/components/storyAssets/storyAssetPresentation.ts"),
  "utf8",
);

test("角色卡片展示推断出的分镜比例基准", () => {
  assert.match(source, /asset\.heightProfile/);
  assert.match(source, /分镜比例基准/);
  assert.match(source, /(?:displayHeight|heightMeters)\.toFixed\(1\)/);
});
