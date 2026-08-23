import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relativePath) => readFileSync(resolve(import.meta.dirname, "..", relativePath), "utf8");

test("settings overview exposes a global video output resolution card", () => {
  const overview = read("src/pages/settings/views/SettingsOverviewPage.tsx");
  const card = read("src/pages/settings/components/DramaVideoRenderProfileCard.tsx");
  assert.match(overview, /DramaVideoRenderProfileCard/);
  assert.match(card, /视频输出/);
  assert.match(card, /720P/);
  assert.match(card, /1280×720/);
  assert.match(card, /1080P/);
  assert.match(card, /1920×1080/);
});

test("frontend API and query key point to the drama video render profile setting", () => {
  const api = read("src/api/settings.ts");
  const queryKeys = read("src/api/queryKeys.ts");
  assert.match(api, /settings\/drama-video-render-profile/);
  assert.match(queryKeys, /dramaVideoRenderProfile/);
});
