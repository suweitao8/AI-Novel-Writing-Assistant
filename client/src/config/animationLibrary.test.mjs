import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ANIMATION_CATALOG_ENTRIES } from "./animationCatalogEntries.ts";
import {
  ANIMATION_LIBRARY,
  ANIMATION_LIBRARY_CATEGORIES,
} from "./animationLibrary.ts";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(configDir, "../..");

/** 解析 GLB：返回动画名 → 时长（从采样器 input 的原始浮点取最大值，本文件的
 * input accessor 未写 min/max，不能走 accessor.max 捷径）。 */
function parseAnimationDurations(glbPath) {
  const buffer = fs.readFileSync(glbPath);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 20 + jsonLength + 8;
  const durations = new Map();
  for (const animation of json.animations ?? []) {
    let maxTime = 0;
    for (const sampler of animation.samplers) {
      const accessor = json.accessors[sampler.input];
      const view = json.bufferViews[accessor.bufferView];
      const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let index = 0; index < accessor.count; index += 1) {
        maxTime = Math.max(maxTime, buffer.readFloatLE(offset + index * 4));
      }
    }
    durations.set(animation.name, maxTime);
  }
  return durations;
}

function parseAnimationFrameRates(glbPath) {
  const buffer = fs.readFileSync(glbPath);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 20 + jsonLength + 8;
  const readTimes = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex];
    const view = json.bufferViews[accessor.bufferView];
    const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, index) =>
      buffer.readFloatLE(offset + index * 4),
    );
  };
  const frameRates = new Map();
  for (const animation of json.animations ?? []) {
    const deltas = [];
    for (const inputIndex of new Set((animation.samplers ?? []).map((sampler) => sampler.input))) {
      const times = readTimes(inputIndex);
      for (let index = 1; index < times.length; index += 1) {
        const delta = times[index] - times[index - 1];
        if (delta > 1e-5 && Number.isFinite(delta)) deltas.push(delta);
      }
    }
    deltas.sort((left, right) => left - right);
    const middle = Math.floor(deltas.length / 2);
    const median = deltas.length % 2 === 1
      ? deltas[middle]
      : (deltas[middle - 1] + deltas[middle]) / 2;
    frameRates.set(animation.name, Math.round(1 / median));
  }
  return frameRates;
}

test("动画库目录条目指向真实存在且包含对应片段的 GLB", () => {
  assert.ok(ANIMATION_LIBRARY.length > 0, "目录不应为空");
  const durationsByFile = new Map();
  const frameRatesByFile = new Map();
  for (const entry of ANIMATION_LIBRARY) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(entry.name.length > 0);
    assert.ok(entry.clipName.length > 0);
    assert.ok(Number.isInteger(entry.frameRate) && entry.frameRate > 0);
    assert.ok(
      entry.source === "legacy" || entry.source === "unreal",
      `目录来源必须是 legacy 或 unreal：${entry.source}`,
    );
    assert.equal(entry.category, entry.actionTypeLabel);

    const publicPath = path.join(clientDir, "public", entry.fileUrl);
    assert.ok(fs.existsSync(publicPath), `目录文件应存在：${entry.fileUrl}`);

    if (!durationsByFile.has(entry.fileUrl)) {
      durationsByFile.set(entry.fileUrl, parseAnimationDurations(publicPath));
      frameRatesByFile.set(entry.fileUrl, parseAnimationFrameRates(publicPath));
    }
    const durations = durationsByFile.get(entry.fileUrl);
    const frameRates = frameRatesByFile.get(entry.fileUrl);
    assert.ok(durations.has(entry.clipName), `GLB 应包含片段 ${entry.clipName}`);
    assert.equal(
      frameRates.get(entry.clipName),
      entry.frameRate,
      `${entry.clipName} 帧率应与 GLB 采样间隔一致`,
    );
    assert.ok(
      Math.abs(durations.get(entry.clipName) - entry.durationSeconds) < 0.08,
      `${entry.clipName} 时长应与 GLB 一致`,
    );
  }

  const actualClipNames = new Set(
    [...durationsByFile.values()].flatMap((durations) => [...durations.keys()]),
  );
  const catalogClipNames = new Set(ANIMATION_LIBRARY.map((entry) => entry.clipName));
  assert.equal(ANIMATION_LIBRARY.length, actualClipNames.size);
  assert.deepEqual(catalogClipNames, actualClipNames);
  assert.equal(
    ANIMATION_LIBRARY.filter((entry) => entry.source === "unreal").length,
    ANIMATION_CATALOG_ENTRIES.length,
  );
  assert.equal(
    ANIMATION_LIBRARY.filter((entry) => entry.source === "legacy").length,
    46,
  );
});

test("动画库目录 id 唯一，同文件条目共享一个 GLB", () => {
  const ids = new Set(ANIMATION_LIBRARY.map((entry) => entry.id));
  assert.equal(ids.size, ANIMATION_LIBRARY.length);
  const files = new Set(ANIMATION_LIBRARY.map((entry) => entry.fileUrl));
  assert.ok(files.size <= ANIMATION_LIBRARY.length);
  // 所有条目合并进同一个 GLB：文件数应远小于条目数。
  assert.equal(files.size, 1);
});

test("分类页签覆盖所有实际条目分类", () => {
  const entryCategories = new Set(ANIMATION_LIBRARY.map((entry) => entry.category));
  for (const category of entryCategories) {
    assert.ok(ANIMATION_LIBRARY_CATEGORIES.includes(category), `页签缺少分类：${category}`);
  }
});
