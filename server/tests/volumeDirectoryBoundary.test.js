const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const volumeRoot = path.join(repoRoot, "src", "services", "novel", "volume");

test("volume stays grouped into owned submodules", () => {
  const rootTsFiles = fs
    .readdirSync(volumeRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootTsFiles, [
    "ChapterExecutionContractService.ts",
    "ChapterTaskSheetQualityGateService.ts",
    "NovelVolumeService.ts",
    "VolumeChapterSyncService.ts",
    "chapterDetailModeLabel.ts",
    "chapterTitleDiversity.ts",
    "volumeDraftContext.ts",
    "volumeModels.ts",
    "volumePlanChangeDetection.ts",
    "volumePlanUtils.ts",
  ]);

  for (const dirname of ["chapterDetail", "generation", "workspace"]) {
    const fullPath = path.join(volumeRoot, dirname);
    assert.equal(fs.statSync(fullPath).isDirectory(), true, `volume/${dirname} must be a directory`);
  }
});
