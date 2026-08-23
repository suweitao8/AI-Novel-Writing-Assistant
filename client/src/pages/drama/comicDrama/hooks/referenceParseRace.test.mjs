import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("reference parsing waits for the chapter draft autosave before writing its result", () => {
  const source = fs.readFileSync(path.join(HERE, "useReferenceDraftStage.ts"), "utf8");

  assert.match(source, /await workspace\.flushExpectationSave\(\)/);
});
