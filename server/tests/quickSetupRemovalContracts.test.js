const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SHARED_ROOT = path.resolve(SERVER_ROOT, "../shared");

function readFrom(root, relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("quick setup has no server route, service, or shared type contract", () => {
  const routes = readFrom(SERVER_ROOT, "src/modules/setup/onboarding/http/onboardingRoutes.ts");
  const firstNovel = readFrom(SERVER_ROOT, "src/modules/setup/onboarding/application/FirstNovelOnboardingService.ts");
  const sharedTypes = readFrom(SHARED_ROOT, "types/onboarding.ts");

  assert.doesNotMatch(routes, /settings\/quick-setup|QuickSetupService|CompleteQuickSetup/);
  assert.doesNotMatch(firstNovel, /QuickSetupService|getQuickSetupStatus|open_quick_setup/);
  assert.doesNotMatch(sharedTypes, /QuickSetup|open_quick_setup/);
  assert.equal(
    existsSync(path.join(SERVER_ROOT, "src/modules/setup/onboarding/application/QuickSetupService.ts")),
    false,
  );
});
