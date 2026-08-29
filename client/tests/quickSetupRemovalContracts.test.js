import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(CLIENT_ROOT, relativePath), "utf8");
}

test("quick setup has no client mount, trigger, or API contract", () => {
  const appLayout = read("src/components/layout/AppLayout.tsx");
  const aiButton = read("src/components/common/AiButton.tsx");
  const home = read("src/pages/Home.tsx");
  const journeyStrip = read("src/components/onboarding/FirstNovelJourneyStrip.tsx");
  const onboardingApi = read("src/api/onboarding.ts");
  const queryKeys = read("src/api/queryKeys.ts");

  assert.doesNotMatch(appLayout, /CreationSetupProvider|QuickSetupDialog/);
  assert.doesNotMatch(aiButton, /useCreationSetup|requireCreationSetup/);
  assert.doesNotMatch(home, /CreationSetupNotice/);
  assert.match(journeyStrip, /to=\{journey\.primaryAction\.route\}/);
  assert.doesNotMatch(onboardingApi, /getQuickSetupStatus|completeQuickSetup|quick-setup/);
  assert.doesNotMatch(queryKeys, /quickSetup|quick-setup/);
  assert.match(aiButton, /onClick=\{\(event\) =>/);

  for (const relativePath of [
    "src/components/onboarding/CreationSetupContext.tsx",
    "src/components/onboarding/CreationSetupNotice.tsx",
    "src/components/onboarding/QuickSetupDialog.tsx",
    "src/components/onboarding/creationSetupState.ts",
    "src/components/onboarding/creationSetupState.test.mjs",
  ]) {
    assert.equal(existsSync(join(CLIENT_ROOT, relativePath)), false, relativePath);
  }
});
