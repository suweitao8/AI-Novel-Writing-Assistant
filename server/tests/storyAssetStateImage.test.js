const test = require("node:test");
const assert = require("node:assert/strict");

// 资产状态图（StoryAssetStateImageService）纯函数契约：
// 提示词组装（角色/场景/道具 + 基础外观 + 状态变化 + 参考图一致性指令）
// 与参考图解析（只认仍有可用 URL 指针的状态图；失败/生成中可继续沿用旧图）。

const {
  buildStateImagePrompt,
  dismissStoryAssetImageError,
  resolveStateReferenceImageUrl,
  stateImageUrl,
} = require("../dist/modules/novel/story-settings/application/StoryAssetStateImageService.js");
const {
  scopeStateImageUrls,
  stateImageDir,
} = require("../dist/modules/novel/story-settings/application/StoryAssetStateImageStorage.js");
const fs = require("node:fs");
const path = require("node:path");

const imageServiceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/application/StoryAssetStateImageService.ts"),
  "utf8",
);

test("buildStateImagePrompt：角色带状态身份信息与参考图一致性指令", () => {
  const prompt = buildStateImagePrompt({
    kind: "character",
    assetName: "林澈",
    baseAppearance: null,
    gender: "male",
    state: { label: "重伤", ageGroup: "youth", description: "左臂受伤流血", imagePrompt: "衣服破损，左臂缠着渗血的绷带" },
    hasReference: true,
  }, ["style: 角色画风", "style: 现代都市"]);
  assert.match(prompt, /character state reference image/);
  assert.match(prompt, /subject: 林澈/);
  assert.match(prompt, /gender: male/);
  assert.match(prompt, /age group: youth/);
  assert.match(prompt, /state: 重伤/);
  assert.match(prompt, /state change: 左臂受伤流血/);
  assert.match(prompt, /state image prompt: 衣服破损/);
  assert.match(prompt, /keep the same subject identity as the reference image/);
  // 参考图只锁主体身份：时代观感跟当前风格方向走——风格不同就要大胆转变环境，
  // 干净日常风格里旧图的磨损脏污不得带入（除非风格或状态本身描写）。
  assert.match(prompt, /the era look follows the current style direction/);
  assert.match(prompt, /transform the environment boldly to fully express the new style/);
  assert.match(prompt, /do not carry over wear, dirt or damage from the reference image unless the style direction or the state describes it/);
  assert.ok(prompt.startsWith("style: 角色画风"));
});

test("buildStateImagePrompt：不参考时不输出一致性指令；场景/道具各用主题行", () => {
  const scene = buildStateImagePrompt({
    kind: "scene",
    assetName: "废弃地铁站",
    baseAppearance: null,
    state: {
      label: "黑夜",
      description: "停电后的站台",
      imagePrompt: "应急灯红光，一片漆黑",
      sceneType: "exterior",
      timeOfDay: "night",
      weather: "rainy",
    },
    hasReference: false,
  }, []);
  assert.match(scene, /scene state reference image/);
  assert.match(scene, /2:1 aspect ratio/);
  assert.match(scene, /subject: 废弃地铁站/);
  assert.match(scene, /scene type: exterior/);
  assert.match(scene, /time of day: night/);
  assert.match(scene, /weather: rainy/);
  assert.doesNotMatch(scene, /base appearance: /);
  // 2026-08-22：场景状态图必须是 360° 等距柱状全景（前端有全景预览），不再按主体构图。
  assert.match(scene, /360-degree equirectangular panorama/);
  assert.match(scene, /seamless horizontal wrap-around view/);
  assert.match(scene, /horizon line is exactly centered at vertical v=0\.5/);
  assert.match(scene, /upper half \(v=0\.0-0\.5\)/);
  assert.match(scene, /lower half \(v=0\.5-1\.0\) is primarily one continuous clean ground/);
  assert.match(scene, /do not place large furniture, trees, buildings, rocks or other tall objects deep in the lower half/);
  assert.doesNotMatch(scene, /uniform detail and sharpness across the whole 360-degree view/);
  assert.doesNotMatch(scene, /strong subject focus/);
  const prop = buildStateImagePrompt({
    kind: "prop",
    assetName: "军刀",
    baseAppearance: "生锈的军刀",
    state: { label: "折断", description: "刀身折断", imagePrompt: "断裂的刀身，断口发亮" },
    hasReference: false,
  }, []);
  assert.match(prop, /prop state reference image/);
  assert.match(prop, /base appearance: 生锈的军刀/);
  assert.doesNotMatch(prop, /keep the same subject identity/);
  // 2026-08-22：角色/道具参考图统一透明底；场景全景保持不透明。
  assert.match(prop, /fully transparent background, genuine PNG alpha channel/);
  assert.doesNotMatch(scene, /fully transparent background/);
  // 旧提示词里的风格/背景/视图词只是内容描述，不改变渲染方向与背景规则。
  assert.match(prop, /metadata only/);
  // 2026-08-22：道具只渲染道具本身，描述/提示词里的其它物品与环境不进画面。
  assert.match(prop, /render exactly one prop/);
  assert.match(prop, /other objects, surfaces or scenery mentioned in the state description or image prompt are context metadata only/);
  assert.doesNotMatch(scene, /render exactly one prop/);
});

test("场景状态提示词会把叙事里的生物改写为环境痕迹", () => {
  const prompt = buildStateImagePrompt({
    kind: "scene",
    assetName: "荒原猎场",
    baseAppearance: null,
    state: { label: "血雾", description: "怪物出没后的荒原", imagePrompt: "远处有猛兽轮廓" },
    hasReference: false,
  }, []);
  assert.match(prompt, /pure empty environment reference/);
  assert.match(prompt, /environmental traces/);
  assert.doesNotMatch(prompt, /猛兽/);
  assert.doesNotMatch(prompt, /怪物/);
});

test("角色状态图一次生成完整四视图，不再四次独立生图后裁切", () => {
  assert.match(imageServiceSource, /runImageGeneration/);
  assert.match(imageServiceSource, /buildCharacterStateSheetPrompt/);
  assert.match(imageServiceSource, /buildAssetStylePromptLines\(\s*kind,\s*styleContext\.assets\[kind\]/);
  assert.doesNotMatch(imageServiceSource, /runCompositeImageGeneration/);
  assert.doesNotMatch(imageServiceSource, /buildCharacterStateViewPrompts/);
  assert.doesNotMatch(imageServiceSource, /styleContext\.universal/);
});

test("状态图时代风格：eraStyle 未选时兜底内置「现代都市」预设，不再按剧情判定", () => {
  // 2026-08-22 用户要求：状态下拉不提供「自动」，空值固定按内置默认预设（realistic=现代都市）出图；
  // 剧情判定链（scriptJudge/era_style_judge）只保留给分镜首帧（DramaShotKeyframeService）。
  assert.match(imageServiceSource, /pinnedStyle:\s*state\.eraStyle\?\.trim\(\)\s*\|\|\s*DEFAULT_DRAMA_VISUAL_STYLE_ID/);
  // 悬空引用（自定义风格已删）也固定回落「现代都市」：设定处的时代风格（脚本标记/小说默认）
  // 完全不影响状态图（同日用户实测怀疑设定默认风格仍被使用，要求彻底去掉这条影响）。
  assert.match(imageServiceSource, /pinnedMissFallbackStyle:\s*DEFAULT_DRAMA_VISUAL_STYLE_ID/);
  assert.doesNotMatch(imageServiceSource, /scriptJudge/);
  assert.doesNotMatch(imageServiceSource, /resolveStateScriptJudge/);
  assert.doesNotMatch(imageServiceSource, /prisma\.chapter\.findMany/);
});

test("resolveStateReferenceImageUrl：未指定参考时默认取上一状态，null 才表示明确不参考", () => {
  const states = [
    { id: "s1", label: "初始", description: "", imagePrompt: "", image: { status: "done", url: "/api/novels/n1/settings/state-images/s1" } },
    { id: "s2", label: "生成中", description: "", imagePrompt: "", image: { status: "generating" } },
    { id: "s3", label: "无图", description: "", imagePrompt: "" },
    { id: "s4", label: "参考初始", description: "", imagePrompt: "", referenceStateId: "s1" },
  ];
  assert.equal(
    resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s1" }),
    "/api/novels/n1/settings/state-images/s1",
  );
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s2" }), "/api/novels/n1/settings/state-images/s1");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s3" }), "/api/novels/n1/settings/state-images/s1");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: "s404" }), null);
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[3], referenceStateId: null }), null);
  assert.equal(
    resolveStateReferenceImageUrl(
      [states[0], { id: "s5", label: "默认上一状态", description: "", imagePrompt: "" }],
      { id: "s5", label: "默认上一状态", description: "", imagePrompt: "" },
    ),
    "/api/novels/n1/settings/state-images/s1",
  );
});

test("resolveStateReferenceImageUrl：直接参考状态没有图片时继续沿祖先链查找", () => {
  const states = [
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常", image: { status: "done", url: "/state/s1" } },
    { id: "s2", label: "受伤", description: "轻伤", imagePrompt: "轻伤" },
    { id: "s3", label: "重伤", description: "重伤", imagePrompt: "重伤" },
  ];
  assert.equal(resolveStateReferenceImageUrl(states, states[2]), "/state/s1");
});

test("resolveStateReferenceImageUrl：失败或重新生成中的状态仍可沿用保留的旧图片", () => {
  const states = [
    { id: "s1", label: "初始", description: "正常", imagePrompt: "正常", image: { status: "done", url: "/state/s1" } },
    { id: "s2", label: "重试失败", description: "轻伤", imagePrompt: "轻伤", image: { status: "error", url: "/state/s2", error: "timeout" } },
    { id: "s3", label: "重试中", description: "重伤", imagePrompt: "重伤", image: { status: "generating", url: "/state/s3" } },
  ];
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[0], id: "s4", referenceStateId: "s2" }), "/state/s2");
  assert.equal(resolveStateReferenceImageUrl(states, { ...states[0], id: "s5", referenceStateId: "s3" }), "/state/s3");
});

test("关闭状态图失败提示只移除 error，不删除已确认图片或重试状态", () => {
  const image = {
    status: "error",
    artifactId: "artifact-1",
    url: "/state/s2",
    prompt: "完整提示词",
    provider: "codex",
    generatedAt: "2026-08-25T10:00:00.000Z",
    error: "生成超时，请重试。",
  };

  assert.deepEqual(dismissStoryAssetImageError(image), {
    status: "error",
    artifactId: "artifact-1",
    url: "/state/s2",
    prompt: "完整提示词",
    provider: "codex",
    generatedAt: "2026-08-25T10:00:00.000Z",
  });
  assert.deepEqual(dismissStoryAssetImageError({ status: "done", url: "/state/s3" }), {
    status: "done",
    url: "/state/s3",
  });
});

test("状态图 URL 必须包含资产归属，避免不同资产复用 initial 状态时互相覆盖", () => {
  const characterA = stateImageUrl("n1", "character", "c1", "initial");
  const characterB = stateImageUrl("n1", "character", "c2", "initial");
  assert.equal(characterA, "/api/novels/n1/settings/state-images/character/c1/initial");
  assert.notEqual(characterA, characterB);
  assert.notEqual(
    stateImageDir("n1", "character", "c1", "initial"),
    stateImageDir("n1", "character", "c2", "initial"),
  );
  const scopedState = scopeStateImageUrls([
    { id: "initial", label: "默认", description: "默认", imagePrompt: "默认", image: { status: "done", url: "/legacy" } },
  ], "n1", "character", "c1");
  assert.equal(scopedState[0].image.url, characterA);

  const routesSource = fs.readFileSync(
    path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
    "utf8",
  );
  assert.match(routesSource, /state-images\/:kind\/:assetId\/:stateId/);

  const dramaContextSource = fs.readFileSync(
    path.join(__dirname, "../src/services/drama/DramaContextAssembler.ts"),
    "utf8",
  );
  const keyframeSource = fs.readFileSync(
    path.join(__dirname, "../src/services/drama/visual/DramaShotKeyframeService.ts"),
    "utf8",
  );
  assert.match(dramaContextSource, /scopeStateImageUrls/);
  assert.match(keyframeSource, /stateImageUrl\(novelId, "scene"/);
  assert.match(keyframeSource, /stateImageUrl\(novelId, "prop"/);
});

test("场景和道具状态图写回时会保留无状态旧资产的初始状态", () => {
  assert.match(imageServiceSource, /normalizeStoryAssetStates/);
  assert.match(imageServiceSource, /updateStoryAssetStateJsonWithCas/);
  assert.match(imageServiceSource, /statesJson: expectedRaw/);
});

// 生成中可手动终止（2026-08-23 用户要求）：代理切错、生成卡住时要能停掉重来，
// 不等 15 分钟超时；服务重启残留的僵尸 generating 也要能被终止接口直接修复。
test("状态图生成可终止：in-flight AbortController + cancel 路由 + 僵尸 generating 改写", () => {
  const routesSource = fs.readFileSync(
    path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
    "utf8",
  );
  const runnerSource = fs.readFileSync(
    path.join(__dirname, "../src/services/image/runtime/runner.ts"),
    "utf8",
  );
  const providerSource = fs.readFileSync(
    path.join(__dirname, "../src/services/image/provider.ts"),
    "utf8",
  );

  // 服务：在跑的生成注册进 inFlightGenerations 并把 signal 穿透到 runner；
  // cancelStateImage 中止在跑请求，无在跑请求的 generating 直接改写为 error。
  assert.match(imageServiceSource, /inFlightGenerations/);
  assert.match(imageServiceSource, /async cancelStateImage/);
  assert.match(imageServiceSource, /flight\.controller\.abort\(\)/);
  assert.match(imageServiceSource, /IMAGE_GENERATION_CANCELLED_MESSAGE/);
  const signalMatches = imageServiceSource.match(/signal: controller\.signal/g) ?? [];
  assert.equal(signalMatches.length, 2);

  // 路由：三类资产各有 cancel-image。
  for (const kind of ["characters/:characterId", "scenes/:sceneId", "props/:propId"]) {
    assert.match(routesSource, new RegExp(`/${kind}/states/:stateId/cancel-image`));
  }
  const cancelRouteMatches = routesSource.match(/cancelStateImage/g) ?? [];
  assert.equal(cancelRouteMatches.length, 3);

  // runner：终止时不走失败分支，写回 error 态并正常返回。
  assert.match(runnerSource, /IMAGE_GENERATION_CANCELLED_MESSAGE = "已终止生成，可重新生成。"/);
  assert.match(runnerSource, /opts\.signal\?\.aborted/);
  assert.match(runnerSource, /signal: opts\.signal/);

  // provider：外部信号联动内部控制器，立即断开请求（本地桥收到断开会杀 codex）。
  assert.match(providerSource, /addEventListener\("abort", onExternalAbort\)/);
  assert.match(providerSource, /removeEventListener\("abort", onExternalAbort\)/);
});
