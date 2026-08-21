const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const {
  CHARACTER_STATE_SHEET_TEMPLATE,
  buildCharacterStateViewPrompts,
  composeCharacterStateSheet,
} = require("../dist/services/drama/visual/characterStateSheet.js");

test("builds four character state view prompts in stable order", () => {
  const prompts = buildCharacterStateViewPrompts({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦，深色短发",
    stateLabel: "初始形象",
    stateDescription: "穿洗旧衬衫和深色长裤",
    stateImagePrompt: "青年男性大学生",
    styleLines: ["写实动漫风格"],
  });

  assert.deepEqual(
    prompts.map((item) => item.id),
    ["front_portrait", "front_full_body", "side_full_body", "back_full_body"],
  );
  assert.equal(prompts.length, 4);
  assert.ok(prompts.every((item) => item.prompt.includes("纯白或浅灰色摄影棚背景")));
  assert.ok(prompts.every((item) => item.prompt.includes("同一个角色")));
  assert.match(prompts[0].prompt, /正面头像/);
  assert.match(prompts[1].prompt, /正面全身/);
  assert.match(prompts[2].prompt, /严格 90 度侧面/);
  assert.match(prompts[3].prompt, /背面全身/);
});

test("character sheet template has one portrait slot and three full-body slots", () => {
  assert.deepEqual(CHARACTER_STATE_SHEET_TEMPLATE.size, { width: 1536, height: 1024 });
  assert.deepEqual(
    CHARACTER_STATE_SHEET_TEMPLATE.slots.map((slot) => slot.id),
    ["front_portrait", "front_full_body", "side_full_body", "back_full_body"],
  );
  assert.equal(
    CHARACTER_STATE_SHEET_TEMPLATE.slots.reduce((sum, slot) => sum + slot.width, 0),
    1536,
  );
});

test("composes four view files into a 1536x1024 png", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-four-view-"));
  const viewPaths = {};
  const colors = ["#d11", "#1a5", "#16c", "#a2a"];
  try {
    for (const [index, slot] of CHARACTER_STATE_SHEET_TEMPLATE.slots.entries()) {
      const filePath = path.join(tempDir, `${slot.id}.png`);
      await sharp({
        create: { width: 1280, height: 720, channels: 3, background: colors[index] },
      }).png().toFile(filePath);
      viewPaths[slot.id] = filePath;
    }

    const outputPath = path.join(tempDir, "sheet.png");
    await composeCharacterStateSheet({ viewPaths, outputPath });
    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.width, 1536);
    assert.equal(metadata.height, 1024);
    assert.equal(metadata.format, "png");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
