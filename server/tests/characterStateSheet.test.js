const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const {
  CHARACTER_STATE_SHEET_TEMPLATE,
  CHARACTER_STATE_SHEET_NEGATIVE_PROMPT,
  buildCharacterStateSheetPrompt,
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
    ["front_portrait", "side_portrait", "front_full_body", "back_full_body"],
  );
  assert.equal(prompts.length, 4);
  assert.ok(prompts.every((item) => item.prompt.includes("游戏资产展示板背景")));
  assert.ok(prompts.every((item) => item.prompt.includes("同一个角色")));
  assert.match(prompts[0].prompt, /正面头像/);
  assert.match(prompts[1].prompt, /侧面头像/);
  assert.match(prompts[1].prompt, /严格 90 度侧脸/);
  assert.match(prompts[2].prompt, /正面全身/);
  assert.match(prompts[3].prompt, /背面全身/);
});

test("character state prompts keep the unified cinematic game-rendering direction", () => {
  const prompts = buildCharacterStateViewPrompts({
    assetName: "叶晨",
    stateLabel: "初始形象",
    stateDescription: "大学时期的朴素旧衣",
    stateImagePrompt: "写实动漫风格，纯白背景",
    styleLines: ["虚幻引擎5级写实3D电影渲染"],
  });

  const prompt = prompts[0].prompt;
  assert.match(prompt, /写实动漫风格，纯白背景/);
  assert.match(prompt, /统一影视化游戏美术方向优先/);
  assert.match(prompt, /虚幻引擎5/);
  assert.match(prompt, /高预算动作游戏的影视化3D数字人设定稿/);
  assert.match(prompt, /黑神话：悟空/);
  assert.match(prompt, /只参考数字雕刻、材质、光影和镜头质感/);
  assert.match(prompt, /不得把成片改成平面动漫、插画、真人摄影、摄影棚模特、证件照或普通照片/);
  assert.match(prompt, /最终渲染优先级/);
});

test("builds one four-panel sheet prompt instead of four independent view prompts", () => {
  const prompt = buildCharacterStateSheetPrompt({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦结实，深色短发",
    stateLabel: "初始形象",
    stateDescription: "穿洗旧衬衫和深色长裤",
    stateImagePrompt: "青年男性大学生",
    styleLines: ["虚幻引擎5级写实3D电影渲染"],
    hasReference: false,
  });

  assert.match(prompt, /ONE production character reference board/);
  assert.match(prompt, /four equal-width vertical panels/);
  assert.match(prompt, /PANEL 1.*front face close-up/is);
  assert.match(prompt, /PANEL 2.*exact 90-degree side face close-up/is);
  assert.match(prompt, /PANEL 3.*front full body/is);
  assert.match(prompt, /PANEL 4.*back full body/is);
  assert.match(prompt, /same single person/);
  assert.match(prompt, /不添加环境故事或其他人物/);
  assert.match(prompt, /not four separate images/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /multiple people/);
});

test("character sheet prompt prioritizes an attractive mainstream drama protagonist", () => {
  const prompt = buildCharacterStateSheetPrompt({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦结实，深色短发，五官冷硬",
    stateLabel: "初始形象",
    stateDescription: "末世幸存者回到大学时期的朴素旧衣",
    stateImagePrompt: "青年男性大学生，写实动漫风格，纯白背景",
    styleLines: ["虚幻引擎5级写实3D电影渲染"],
    hasReference: false,
  });

  assert.match(prompt, /handsome, commercially appealing leading-man protagonist/i);
  assert.match(prompt, /symmetrical facial proportions/i);
  assert.match(prompt, /clear healthy skin/i);
  assert.match(prompt, /well-groomed/i);
  assert.match(prompt, /not gaunt, exhausted, sickly, awkward, or unattractive/i);
  assert.match(prompt, /末世感只作用于表情、服装磨损和材质细节/);
});

test("character sheet template uses four equal native Grok Build columns", () => {
  assert.deepEqual(CHARACTER_STATE_SHEET_TEMPLATE.size, { width: 1280, height: 720 });
  assert.deepEqual(
    CHARACTER_STATE_SHEET_TEMPLATE.slots.map((slot) => slot.id),
    ["front_portrait", "side_portrait", "front_full_body", "back_full_body"],
  );
  assert.equal(
    CHARACTER_STATE_SHEET_TEMPLATE.slots.reduce((sum, slot) => sum + slot.width, 0),
    1280,
  );
  assert.deepEqual(
    CHARACTER_STATE_SHEET_TEMPLATE.slots.map((slot) => slot.width),
    [320, 320, 320, 320],
  );
});

test("composes four view files into a 1280x720 png without changing the panel contract", async () => {
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
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    assert.equal(metadata.format, "png");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
