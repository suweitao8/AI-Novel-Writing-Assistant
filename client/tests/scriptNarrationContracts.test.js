import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);
const chapterWorkspaceSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts", import.meta.url),
  "utf8",
);

test("旁白行不显示或编辑语气控件", () => {
  assert.match(
    scriptTabSource,
    /\{!isNarrator\s*\?\s*\([\s\S]*?placeholder="语气"[\s\S]*?（语气）[\s\S]*?\)\s*:\s*null\}/,
  );
});

test("章节载入时会把旧旁白语气规范化并静默保存", () => {
  assert.match(chapterWorkspaceSource, /normalizeNarratorMoodInScript/);
  assert.match(chapterWorkspaceSource, /const normalizedExpectation\s*=\s*normalizeNarratorMoodInScript\(expectation\)/);
  assert.match(chapterWorkspaceSource, /saveExpectationMutation\.mutate\(\{[\s\S]*normalizedExpectation[\s\S]*silent:\s*true/);
});
