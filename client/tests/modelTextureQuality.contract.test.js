import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const clientRoot = process.cwd();
const rockTexturePath = path.join(
  clientRoot,
  "public/models/cine57/tex/_Enviroments_Mountain_Environment_Set_Rocks_Textures_T_rocks_atlas_01_BC.T_rocks_atlas_01_BC_baseColor.jpg",
);
const thumbnailStudioSource = readFileSync(
  path.join(clientRoot, "src/pages/models/modelLibrary3d/thumbnailStudio.ts"),
  "utf8",
);
const importSkillSource = readFileSync(
  path.join(clientRoot, "../.agents/skills/unreal-import/SKILL.md"),
  "utf8",
);

test("representative baseColor texture keeps enough encoded detail for close 3D previews", () => {
  assert.equal(existsSync(rockTexturePath), true, "the published rock baseColor texture must exist");

  const { size } = statSync(rockTexturePath);
  assert.ok(
    size >= 500_000,
    `the rock baseColor texture is still suspiciously over-compressed (${size} bytes)`,
  );
});

test("model thumbnails use a cache version newer than the pre-quality-fix cache", () => {
  assert.match(thumbnailStudioSource, /model-library:thumbnails:v20/);
  assert.doesNotMatch(thumbnailStudioSource, /model-library:thumbnails:v18/);
});

test("model import guidance treats ffmpeg q:v as a high-quality quantizer", () => {
  assert.match(importSkillSource, /-q:v 2/);
  assert.doesNotMatch(importSkillSource, /质量 82/);
});
