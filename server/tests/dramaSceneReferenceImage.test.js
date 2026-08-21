import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/services/drama/visual/DramaShotKeyframeService.ts", import.meta.url),
  "utf8",
);

test("首帧场景参考图只来自初始状态图片", () => {
  assert.match(source, /scenes: scenes\.map\(\(\{ statesJson, \.\.\.rest \}\) => \{[\s\S]*?imageUrl: initial\.imageUrl \?\? null/);
  assert.doesNotMatch(source, /scenes: scenes\.map\(\(\{ imageData, statesJson, \.\.\.rest \}\) => \{[\s\S]*?parseImageStateSummary\(imageData\)/);
  assert.match(source, /初始状态图/);
  assert.doesNotMatch(source, /label: `\$\{matchedScene\.name\} · 场景全景`/);
});
