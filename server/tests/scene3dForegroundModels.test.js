const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeStoryScene3dForegroundModels,
} = require("../../shared/dist/utils/scene3dForegroundModels.js");
const {
  normalizeBlockingSketchData,
} = require("../dist/services/drama/visual/DramaShotBlockingSketchContracts.js");

const baseCamera = {
  azim: -35,
  elev: -10,
  distance: 7,
  focalPoint: [0, 0.8, 0],
  fovDeg: 52,
  nearClip: 0.05,
  farClip: 200,
  depthOfFieldEnabled: false,
  focusDistance: 7,
  focusRange: 4,
  blurRadius: 3,
};

const model = {
  id: "foreground-model-table-1",
  modelId: "table",
  label: "餐桌",
  modelName: "餐桌",
  category: "家具",
  position: [0, 0, 1.5],
  yawDeg: 0,
  scale: 1,
  source: "model-library",
  usage: {
    supportSurface: "ground",
    placementMode: "grounded",
    anchor: "base",
    orientation: "upright",
    requiresFacingDirection: false,
  },
};

test("前景模型状态只保留模型库引用和安全的变换数据", () => {
  const normalized = normalizeStoryScene3dForegroundModels([
    model,
    { ...model, id: "bad", position: [200, 0, 0] },
    { ...model, id: "bad-scale", scale: 0 },
  ]);

  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0], model);
});

test("3D 草图 layout 会携带前景模型并拒绝越界变换", () => {
  const sketch = {
    status: "draft",
    version: 1,
    scene: {
      assetId: "scene-1",
      stateId: "initial",
      imageUrl: "/scene.png",
      yawDeg: 0,
      pitchDeg: 0,
      fovDeg: 78,
    },
    actors: [],
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: baseCamera,
      actors: [],
      foregroundModels: [model],
    },
  };

  const normalized = normalizeBlockingSketchData(sketch);
  assert.equal(normalized.layout3d.foregroundModels[0].modelId, "table");
  assert.equal(normalized.layout3d.foregroundModels[0].source, "model-library");

  assert.throws(
    () => normalizeBlockingSketchData({
      ...sketch,
      layout3d: {
        ...sketch.layout3d,
        foregroundModels: [{ ...model, scale: 20 }],
      },
    }),
    /前景模型数据无效/,
  );
});

test("3D 草图会持久化角色与真实模型实例的交互关系", () => {
  const normalized = normalizeBlockingSketchData({
    status: "draft",
    version: 1,
    scene: {
      assetId: "scene-1",
      stateId: "initial",
      imageUrl: "/scene.png",
      yawDeg: 0,
      pitchDeg: 0,
      fovDeg: 78,
    },
    actors: [],
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: baseCamera,
      actors: [{
        characterName: "沈烬",
        position: [0, 0, 1],
        yawDeg: 0,
        scale: [1, 1, 1],
        pose: "sitting",
        interactionModelId: model.id,
        actionPlaying: false,
      }],
      foregroundModels: [model],
    },
  });
  assert.equal(normalized.layout3d.actors[0].interactionModelId, model.id);
  assert.throws(
    () => normalizeBlockingSketchData({
      ...normalized,
      layout3d: {
        ...normalized.layout3d,
        actors: [{ ...normalized.layout3d.actors[0], interactionModelId: "model-missing" }],
      },
    }),
    /角色交互模型不存在/,
  );
});
