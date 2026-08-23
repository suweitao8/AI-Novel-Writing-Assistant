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
  assert.ok(prompts.every((item) => item.prompt.includes("全透明背景")));
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
  assert.match(prompt, /each panel must fill the full height/);
  assert.match(prompt, /不添加环境故事或其他人物/);
  assert.match(prompt, /not four separate images/);
  // 2026-08-22：角色参考板统一透明底（PNG alpha），负面词同步禁止实底/棋盘格。
  assert.match(prompt, /fully transparent background/i);
  assert.match(prompt, /genuine PNG alpha channel/i);
  assert.doesNotMatch(prompt, /light-grey or white production-board background/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /multiple people/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /opaque background/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /checkerboard/);
});

test("character sheet prompt keeps appeal but forbids the generic template face", () => {
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

  // 2026-08-23：好看程度按角色身份伸缩、长相必须来自角色资料自身特征——旧版
  // 「统一帅气男主脸」硬约束（对称五官+直鼻梁+干净下颌线）把所有角色画成同一张
  // 3D 动画网红脸（用户实测反馈），已整体替换。
  assert.match(prompt, /APPEAL WITH DISTINCT IDENTITY/i);
  assert.match(prompt, /matches their identity and story importance/i);
  assert.match(prompt, /OWN facial features in the character data/i);
  assert.match(prompt, /invent specific memorable traits that fit the character's identity/i);
  assert.match(prompt, /Never render the generic influencer \/ idol-drama template face/i);
  assert.match(prompt, /must never share the same face/i);
  // 2026-08-23：穿搭同口径——按角色资料的性格/年龄/身份渲染与设计，不给全员同一套默认装。
  assert.match(prompt, /STYLING \(HARD CONSTRAINT\)/);
  assert.match(prompt, /design clothing and grooming that fit the character's personality, age and identity/);
  assert.match(prompt, /should not share the same default outfit/);
  assert.doesNotMatch(prompt, /LEADING-MAN APPEAL/);
  assert.doesNotMatch(prompt, /symmetrical facial proportions/);
  assert.doesNotMatch(prompt, /straight nose/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /generic influencer face/);
  assert.match(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /网红脸/);
  assert.doesNotMatch(CHARACTER_STATE_SHEET_NEGATIVE_PROMPT, /asymmetrical facial features/);
  // 2026-08-22→23 演进：模板不写死末世氛围（现代状态图曾被带出脏衣服）；「时代风格方向走」
  // 又让末世书所有角色无条件全身脏旧——现行规则（同日二次拆分）：污渍/血渍/磨损是通用的
  // 角色状态属性，只由角色资料与当前状态描写决定；时代风格只管时代氛围与服装设计方向。
  assert.doesNotMatch(prompt, /末世感/);
  assert.match(prompt, /时代风格只决定时代氛围与服装设计方向/);
  assert.match(prompt, /角色身上是否干净、是否有磨损、污渍、血渍、尘土、伤痕，只由角色资料与当前状态描写决定/);
  assert.match(prompt, /状态没写就默认干净整洁、状态如新/);
  assert.match(prompt, /任何时代风格都不自动给角色添加污渍或破败/);
  assert.doesNotMatch(prompt, /风格自带的磨损、锈蚀、风化与时代质感要按风格充分呈现/);
  // 2026-08-23：状态与时代变化只换装不换脸，辨识度跨状态保持。
  assert.match(prompt, /不得改成统一的网红模板脸/);
  assert.match(prompt, /长相辨识度/);
});

test("reference image anchors identity only; era switching transforms the look boldly", () => {
  const prompt = buildCharacterStateSheetPrompt({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦结实，深色短发",
    stateLabel: "现代日常",
    stateDescription: "大学生日常便装",
    stateImagePrompt: "青年男性大学生",
    styleLines: ["资产类型：角色画风", "当代现代都市氛围"],
    hasReference: true,
  });

  // 2026-08-23：参考图只锁身份（脸/发型/比例）；服装材质与时代氛围跟当前风格方向走——
  // 风格不同（现代都市→末世废土）时要有戏剧性的明显转变，不照抄参考图的旧时代样式；
  // 干净/脏旧跟角色资料与状态走、不跟风格走（同日二次拆分）；透明底随参考图保留。
  assert.match(prompt, /use it ONLY as an identity anchor/);
  assert.match(prompt, /preserve the same face, hairstyle and body proportions/);
  assert.match(prompt, /boldly redesign clothing, accessories, materials and atmosphere/);
  assert.match(prompt, /dramatic, clearly visible transformation/);
  assert.match(prompt, /when the style direction is unchanged, keep the reference's clothing design/);
  assert.match(prompt, /Whether the character is clean or shows wear, dirt, blood or damage follows ONLY the character data and the current state description, never the style direction/);
  assert.match(prompt, /keep the same fully transparent background as the reference/);
  assert.match(prompt, /genuine PNG alpha channel/);
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

test("身上状态标签如实进提示词，不勾不出现（2026-08-23 污渍/血迹跟状态走；同日合并为 5 标签）", () => {
  const withWear = buildCharacterStateSheetPrompt({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦，深色短发",
    stateLabel: "战后",
    stateDescription: "刚经历恶战",
    stateImagePrompt: "青年男性",
    wearTags: ["blood", "grime", "not_a_tag"],
  });
  // 勾选的标签按短语画在角色身上（body condition 行在 CHARACTER DATA 里，优先级高于通用假设）；
  // 未知标签是脏输入，直接丢弃而不是报错；旧版 8 标签 id 由 shared 归一化迁移，不进这里。
  assert.match(withWear, /body condition \(render exactly as described\): 衣物与皮肤上有明显的血迹、血污；衣物、头发与皮肤上有明显的污渍、尘土与泥点/);
  assert.doesNotMatch(withWear, /not_a_tag/);

  const clean = buildCharacterStateSheetPrompt({
    assetName: "叶晨",
    stateLabel: "初始形象",
    stateDescription: "日常便装",
    stateImagePrompt: "青年男性",
    wearTags: [],
  });
  // 没勾任何标签＝干净整洁，不出现 body condition 行（干净默认由模板规则行保证）。
  assert.doesNotMatch(clean, /body condition/);

  // 旧四视图单格路径同口径（身上状态中文行）。
  const viewPrompts = buildCharacterStateViewPrompts({
    assetName: "叶晨",
    stateLabel: "战后",
    stateDescription: "刚经历恶战",
    stateImagePrompt: "青年男性",
    wearTags: ["blood"],
  });
  assert.match(viewPrompts[0].prompt, /身上状态（如实呈现）：衣物与皮肤上有明显的血迹、血污/);
});
