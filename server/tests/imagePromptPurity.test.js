const test = require("node:test");
const assert = require("node:assert/strict");
const {
  stripAssetImagePromptNoise,
} = require("../../shared/dist/utils/imagePromptPurity.js");
const {
  normalizeStoryAssetStates,
} = require("../../shared/dist/types/novelReferenceExtraction.js");

// 资产图片提示词纯度契约（2026-08-22 用户要求）：提示词只写画面内容本身——
// 画风（写实动漫风格）、背景（纯白背景/白底）、视图（全身像/四视图/360 度全景）、
// 时代氛围（末世风格/玄幻感）全部由系统注入，不进提示词；写进去会与注入的
// 硬约束打架。新建数据在解析/微调出口剥离，存量 statesJson 靠 normalize 自愈。

test("剥离用户实测残留：全身像 + 写实动漫风格 + 纯白背景", () => {
  const cleaned = stripAssetImagePromptNoise(
    "全身像，年轻男性大学生，约二十出头，精瘦结实，深色短发，眉眼冷硬锐利，脸色略显苍白，穿着洗旧的简单衬衫与深色长裤、旧运动鞋，气质沉默克制，写实动漫风格，纯白背景。",
  );
  assert.equal(
    cleaned,
    "年轻男性大学生，约二十出头，精瘦结实，深色短发，眉眼冷硬锐利，脸色略显苍白，穿着洗旧的简单衬衫与深色长裤、旧运动鞋，气质沉默克制",
  );
});

test("时代氛围词按「的」修饰写法也能剥掉，内容名词保留", () => {
  assert.equal(
    stripAssetImagePromptNoise("宿舍内部，末世废土风格的破败走廊，玄幻氛围。"),
    "宿舍内部，破败走廊",
  );
  assert.equal(
    stripAssetImagePromptNoise("街道尽头的废土感商店招牌"),
    "街道尽头的商店招牌",
  );
});

test("边界前瞻防止误伤内容词：白底衫、动漫社、写实性描述词不吃", () => {
  assert.equal(stripAssetImagePromptNoise("白色圆领白底衫，袖口磨边"), "白色圆领白底衫，袖口磨边");
  assert.equal(stripAssetImagePromptNoise("动漫社社服外套"), "动漫社社服外套");
});

test("全部是噪音词时返回空串，由调用方走兜底", () => {
  assert.equal(stripAssetImagePromptNoise("全身像，写实动漫风格，纯白背景"), "");
  assert.equal(stripAssetImagePromptNoise(""), "");
});

test("normalizeStoryAssetStates 读/写自愈存量 statesJson 的旧提示词", () => {
  const states = normalizeStoryAssetStates([
    {
      id: "initial",
      label: "初始状态",
      description: "日常形态",
      imagePrompt: "黑色短发，深色夹克，四视图，白底",
    },
    {
      id: "s2",
      label: "废土形态",
      description: "末世后的形态",
      imagePrompt: "写实动漫风格，纯白背景",
    },
  ]);
  assert.equal(states[0].imagePrompt, "黑色短发，深色夹克");
  // 剥完为空的状态回落到状态说明，不会留下空提示词。
  assert.equal(states[1].imagePrompt, "末世后的形态");
});

test("normalize 的兜底初始提示词（旧角色 facePrompt 带入）同样过剥离", () => {
  const states = normalizeStoryAssetStates([], {
    description: "资产初始状态",
    imagePrompt: "青年男性，黑色短发，全身像，写实风格",
  });
  assert.equal(states[0].imagePrompt, "青年男性，黑色短发");
});
