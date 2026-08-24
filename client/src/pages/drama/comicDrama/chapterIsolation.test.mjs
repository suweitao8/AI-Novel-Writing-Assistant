import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("shot voice polling is scoped to the active episode", () => {
  const source = fs.readFileSync(path.join(HERE, "ShotVoiceListPanel.tsx"), "utf8");
  assert.match(source, /job\.episodeId === activeEpisode\?\.id[\s\S]*job\.type === "tts"/);
});

test("shot polling initializes the active chapter before configuring the query", () => {
  const source = fs.readFileSync(path.join(HERE, "ShotVoiceListPanel.tsx"), "utf8");
  const activeOrderIndex = source.indexOf("const activeOrder = chapterOrder;");
  const projectQueryIndex = source.indexOf("const projectQuery = useQuery({");

  assert.notEqual(activeOrderIndex, -1);
  assert.notEqual(projectQueryIndex, -1);
  assert.ok(activeOrderIndex < projectQueryIndex);
});

test("storyboard selection is reconciled when the shot list changes", () => {
  const source = fs.readFileSync(path.join(HERE, "../components/DramaStoryboardBoard.tsx"), "utf8");
  assert.match(source, /setSelectedIds\(\(current\) =>/);
  assert.match(source, /currentShotIds[\s\S]*filter\(\(shotId\) =>/);
});
