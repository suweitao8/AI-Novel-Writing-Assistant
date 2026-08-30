const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseStudioEnvironmentAssetDocument,
  resolveStudioEnvironmentEffectiveState,
} = require("../dist/services/settings/StudioEnvironmentAssetSettingsService.js");

const {
  canDismissStudioEnvironmentImageError,
} = require("../dist/services/settings/StudioEnvironmentStateImageService.js");

function doneImage(url, generatedAt) {
  return { status: "done", url, generatedAt };
}

test("环境资产文档缺失时只有中央广场且带默认状态", () => {
  const document = parseStudioEnvironmentAssetDocument(null);
  assert.deepEqual(Object.keys(document.environments), ["exterior"]);
  for (const asset of Object.values(document.environments)) {
    assert.equal(asset.states.length, 1);
    assert.equal(asset.states[0].label, "默认");
    assert.ok(asset.description);
  }
  assert.equal(document.environments.exterior.label, "中央广场");
});

test("存储文档保留状态资料与生成图，非法字段与已下线环境被剔除", () => {
  const document = parseStudioEnvironmentAssetDocument({
    environments: {
      exterior: {
        label: "中央广场",
        description: "自定义描述",
        activeStateId: "night",
        states: [
          { id: "default", label: "默认", imagePrompt: "main plaza", image: doneImage("/api/x", "2026-08-30T01:00:00.000Z") },
          { id: "night", label: "夜晚", description: "夜间氛围", referenceStateId: "default", eraStyle: "末世废土", timeOfDay: "night", weather: "rainy", image: { status: "error", error: "失败" } },
          { id: "bad id!", label: "非法 id" },
          { id: "night", label: "重复 id" },
        ],
      },
      interior: { label: "室内客厅", states: [{ id: "default", label: "默认" }] },
      nature: { label: "草地自然", states: [{ id: "default", label: "默认" }] },
    },
  });
  const exterior = document.environments.exterior;
  assert.equal(exterior.description, "自定义描述");
  assert.equal(exterior.states.length, 2);
  // "当前全景"概念已废弃：旧文档里的 activeStateId 被白名单丢弃。
  assert.equal(exterior.activeStateId, undefined);
  assert.equal(exterior.states[0].image.status, "done");
  assert.equal(exterior.states[0].image.url, "/api/x");
  assert.equal(exterior.states[1].description, "夜间氛围");
  assert.equal(exterior.states[1].referenceStateId, "default");
  assert.equal(exterior.states[1].eraStyle, "末世废土");
  assert.equal(exterior.states[1].timeOfDay, "night");
  assert.equal(exterior.states[1].weather, "rainy");
  assert.equal(exterior.states[1].image.status, "error");
  // 模型/动画预览已统一为中央广场：已下线的室内/自然环境不入文档。
  assert.equal(document.environments.interior, undefined);
  assert.equal(document.environments.nature, undefined);
});

test("时代风格/时间/天气的非法值被剔除", () => {
  const document = parseStudioEnvironmentAssetDocument({
    environments: {
      exterior: {
        states: [{ id: "default", label: "默认", eraStyle: 42, timeOfDay: "midnight", weather: "foggy" }],
      },
    },
  });
  const state = document.environments.exterior.states[0];
  assert.equal(state.eraStyle, undefined);
  assert.equal(state.timeOfDay, undefined);
  assert.equal(state.weather, undefined);
});

test("生效状态按默认状态优先解析，环境内部没有当前切换", () => {
  const document = parseStudioEnvironmentAssetDocument({
    environments: {
      exterior: {
        states: [{ id: "a", label: "清晨" }, { id: "b", label: "黄昏" }],
      },
    },
  });
  const exterior = document.environments.exterior;
  // 没有"默认"状态时回落第一个状态。
  assert.equal(resolveStudioEnvironmentEffectiveState(exterior).id, "a");
  exterior.states.unshift({ id: "d", label: "默认", description: "默认", imagePrompt: "默认" });
  assert.equal(resolveStudioEnvironmentEffectiveState(exterior).id, "d");
});

test("超长文本被截断而不是拒绝整个文档", () => {
  const document = parseStudioEnvironmentAssetDocument({
    environments: {
      exterior: {
        states: [{ id: "default", label: "默认", imagePrompt: "x".repeat(3000) }],
      },
    },
  });
  const state = document.environments.exterior.states[0];
  assert.ok(state.imagePrompt.length <= 2000);
});

test("失败提示只清除用户看到的那一次错误（乐观校验）", () => {
  const seen = { status: "error", error: "生成失败：上游超时", attemptId: "a-1" };
  assert.equal(canDismissStudioEnvironmentImageError(seen, "生成失败：上游超时"), true);
  assert.equal(canDismissStudioEnvironmentImageError(seen, "生成失败：上游超时", "a-1"), true);
  assert.equal(canDismissStudioEnvironmentImageError(seen, "旧的错误"), false);
  assert.equal(canDismissStudioEnvironmentImageError(seen, "生成失败：上游超时", "a-2"), false);
  assert.equal(canDismissStudioEnvironmentImageError({ status: "done", url: "/x" }, "任意"), false);
  assert.equal(canDismissStudioEnvironmentImageError(undefined, "任意"), false);
});
