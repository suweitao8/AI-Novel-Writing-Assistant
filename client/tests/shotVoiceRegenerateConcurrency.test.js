import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url), "utf8");

test("多个分镜的配音生成可并行，逐镜独立显示在途状态", () => {
  assert.match(source, /const \[regeneratingShotIds, setRegeneratingShotIds\] = useState<Set<string>>/);
  assert.match(source, /setRegeneratingShotIds\(\(prev\) => new Set\(prev\)\.add\(shot\.id\)\)/);
  assert.match(
    source,
    /onSettled:[\s\S]*?setRegeneratingShotIds\(\(prev\) => \{[\s\S]*?next\.delete\(variables\.shot\.id\)/,
  );
  assert.match(source, /regenerating=\{regeneratingShotIds\.has\(shot\.id\)\}/);
});

test("配音在途状态不再使用单槽位互相覆盖", () => {
  assert.doesNotMatch(source, /const \[regeneratingShotId, setRegeneratingShotId\]/);
  assert.doesNotMatch(source, /setRegeneratingShotId\(shot\.id\)/);
  assert.doesNotMatch(source, /setRegeneratingShotId\(null\)/);
});
