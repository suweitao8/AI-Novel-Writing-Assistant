import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = process.env.AI_NOVEL_REPO_ROOT
  ? path.resolve(process.env.AI_NOVEL_REPO_ROOT)
  : path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("Vite shared alias resolves the workspace package and director runtime module", () => {
  const sharedPackagePath = path.join(repoRoot, "shared", "package.json");
  const directorRuntimePath = path.join(repoRoot, "shared", "types", "directorRuntime.ts");

  assert.equal(existsSync(sharedPackagePath), true, "shared/package.json must exist");
  assert.equal(existsSync(directorRuntimePath), true, "shared/types/directorRuntime.ts must exist");

  const sharedPackage = JSON.parse(readFileSync(sharedPackagePath, "utf8"));
  assert.equal(sharedPackage.name, "@ai-novel/shared");
  assert.ok(sharedPackage.exports?.["./types/*"], "the shared package must expose its type modules");
});
