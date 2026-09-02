const assert = require("node:assert/strict");
const test = require("node:test");

const { getAnimationImportRunLayout } = require("./animationImportLayout.cjs");

test("动画导入运行的所有中间目录统一收口到 runs/<run-id>", () => {
  const layout = getAnimationImportRunLayout(
    "D:/UnrealWorkspace/Cine57-exported",
    "20260902-anim57-unarmed-attack-smoke",
  );

  assert.equal(
    layout.runDir,
    "D:/UnrealWorkspace/Cine57-exported/runs/20260902-anim57-unarmed-attack-smoke",
  );
  for (const [name, directory] of Object.entries(layout.directories)) {
    assert.ok(
      directory.startsWith(`${layout.runDir}/`),
      `${name} 不得离开统一运行目录：${directory}`,
    );
  }
  assert.equal(layout.directories.fbx, `${layout.runDir}/fbx`);
  assert.equal(layout.directories.glb, `${layout.runDir}/glb`);
  assert.equal(layout.directories.retarget, `${layout.runDir}/glb/retarget`);
  assert.equal(layout.directories.final, `${layout.runDir}/final`);
  assert.equal(layout.directories.logs, `${layout.runDir}/logs`);
  assert.equal(
    layout.files.stagedSelection,
    `${layout.runDir}/final/animationCatalogSelection.json`,
  );
  assert.equal(
    layout.files.stagedEntries,
    `${layout.runDir}/final/animationCatalogEntries.ts`,
  );
});
