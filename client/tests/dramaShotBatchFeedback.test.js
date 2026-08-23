import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

test("批量生成画面会立即反馈并突出显示生成中的分镜", () => {
  const source = read("pages/drama/comicDrama/ShotVoiceListPanel.tsx");

  assert.match(source, /optimisticKeyframeShotIds/);
  assert.match(source, /onMutate: \(input\)/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /border-primary\/60/);
  assert.match(source, /bg-primary\/10/);
});

test("批量画面生成使用有界并发", () => {
  const source = readFileSync(new URL("../../server/src/services/drama/production/DramaBatchOrchestrator.ts", import.meta.url), "utf8");

  assert.match(source, /DRAMA_KEYFRAME_BATCH_CONCURRENCY = 3/);
  assert.match(source, /runWithConcurrency\(shots, DRAMA_KEYFRAME_BATCH_CONCURRENCY/);
});
