import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scriptTabSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/ScriptTab.tsx", import.meta.url),
  "utf8",
);

test("ScriptTab declares entityNames before loading guards", () => {
  const entityNamesIndex = scriptTabSource.indexOf("const entityNames = useMemo");
  const loadingGuardIndex = scriptTabSource.indexOf("if (workspace.chaptersQuery.isPending)");
  const emptyChapterGuardIndex = scriptTabSource.indexOf("if (!workspace.currentChapter)");

  assert.equal(
    (scriptTabSource.match(/const entityNames = useMemo/g) ?? []).length,
    1,
    "entityNames memo should be declared exactly once",
  );
  assert.notEqual(entityNamesIndex, -1, "entityNames memo should exist");
  assert.notEqual(loadingGuardIndex, -1, "loading guard should exist");
  assert.notEqual(emptyChapterGuardIndex, -1, "empty chapter guard should exist");
  assert.ok(entityNamesIndex < loadingGuardIndex, "entityNames memo must precede loading guard");
  assert.ok(entityNamesIndex < emptyChapterGuardIndex, "entityNames memo must precede empty chapter guard");
});
