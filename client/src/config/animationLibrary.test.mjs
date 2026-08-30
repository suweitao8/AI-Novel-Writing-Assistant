import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ANIMATION_LIBRARY, ANIMATION_LIBRARY_CATEGORIES } from "./animationLibrary.ts";

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

test("动画库目录条目指向真实存在且包含对应片段的 GLB", () => {
  assert.ok(ANIMATION_LIBRARY.length > 0, "目录不应为空");
  const durationsByFile = new Map();
  for (const entry of ANIMATION_LIBRARY) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(entry.name.length > 0);
    assert.ok(entry.clipName.length > 0);
    assert.ok(
      entry.source === "UAL2" || entry.source === "Cine57",
      `目录来源必须是 UAL2 或 Cine57：${entry.source}`,
    );

    const publicPath = path.join(clientDir, "public", entry.fileUrl);
    assert.ok(fs.existsSync(publicPath), `目录文件应存在：${entry.fileUrl}`);

    if (!durationsByFile.has(entry.fileUrl)) {
      durationsByFile.set(entry.fileUrl, parseAnimationDurations(publicPath));
    }
    const durations = durationsByFile.get(entry.fileUrl);
    assert.ok(durations.has(entry.clipName), `GLB 应包含片段 ${entry.clipName}`);
    assert.ok(
      Math.abs(durations.get(entry.clipName) - entry.durationSeconds) < 0.05,
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
    ANIMATION_LIBRARY.filter((entry) => entry.source === "UAL2").length,
    43,
  );
  assert.equal(
    ANIMATION_LIBRARY.filter((entry) => entry.source === "Cine57").length,
    3,
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

test("分类页签覆盖所有条目分类，每个分类至少有一条动画", () => {
  const entryCategories = new Set(ANIMATION_LIBRARY.map((entry) => entry.category));
  for (const category of entryCategories) {
    assert.ok(ANIMATION_LIBRARY_CATEGORIES.includes(category), `页签缺少分类：${category}`);
  }
  for (const category of ANIMATION_LIBRARY_CATEGORIES) {
    assert.ok(
      ANIMATION_LIBRARY.some((entry) => entry.category === category),
      `分类 ${category} 没有任何条目`,
    );
  }
});
