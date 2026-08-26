import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_SKETCH_CANVAS,
  BLOCKING_SKETCH_3D_LIMITS,
  normalizeBlockingSketchData,
  parseBlockingSketchData,
} from "../src/services/drama/visual/DramaShotBlockingSketchContracts.ts";

const validSketch = {
  status: "draft",
  version: 1,
  scene: {
    assetId: "scene-1",
    stateId: "state-1",
    imageUrl: "/api/novels/novel-1/story-settings/scenes/scene-1/states/state-1/image",
    yawDeg: 25,
    pitchDeg: -15,
    fovDeg: 78,
  },
  actors: [
    {
      characterName: "沈烬",
      assetId: "character-1",
      stateId: "state-character-1",
      imageUrl: "/api/novels/novel-1/story-settings/characters/character-1/states/state-character-1/image",
      x: 0.35,
      y: 0.74,
      scale: 0.52,
      flipX: false,
      zIndex: 2,
    },
  ],
};

test("摆位草图固定为横屏 16:9，并保留可恢复的构图数据", () => {
  assert.deepEqual(BLOCKING_SKETCH_CANVAS, { width: 1280, height: 720 });
  assert.deepEqual(normalizeBlockingSketchData(validSketch), validSketch);
});

test("镜头设计说明可随草图快照规范化并兼容旧数据", () => {
  const normalized = normalizeBlockingSketchData({
    ...validSketch,
    compositionNote: "低机位贴近血角兽，角色从画面右侧压入前景。",
  });

  assert.equal(normalized.compositionNote, "低机位贴近血角兽，角色从画面右侧压入前景。");
  assert.equal(normalizeBlockingSketchData(validSketch).compositionNote, undefined);
});

test("摆位草图拒绝越界相机和角色位置，防止脏数据进入正式生图", () => {
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      scene: { ...validSketch.scene, pitchDeg: 61 },
    }),
    /俯仰角/,
  );
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      actors: [{ ...validSketch.actors[0], x: 1.05 }],
    }),
    /横向位置/,
  );
});

test("已有草图 JSON 只接受已知状态，空数据保持兼容", () => {
  assert.equal(parseBlockingSketchData(null), null);
  assert.equal(parseBlockingSketchData("not-json"), null);
  assert.equal(parseBlockingSketchData(JSON.stringify({ ...validSketch, status: "unknown" })), null);
  assert.equal(parseBlockingSketchData(JSON.stringify(validSketch))?.scene.yawDeg, 25);
});

test("3D 草图快照与旧草图字段一起保存，并统一保存静态关键帧姿势", () => {
  const input = {
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: {
        azim: 10,
        elev: -15,
        distance: 4,
        focalPoint: [1, 0, -2],
      },
      actors: [
        {
          characterName: "沈烬",
          position: [2.5, 0, -1.5],
          yawDeg: 35,
          scale: [1.4, 1.4, 1.4],
          pose: "sitting",
          actionPlaying: false,
          color: [0.12, 0.34, 0.56],
        },
        {
          characterName: "血角兽",
          position: [-1, 0, 0.5],
          yawDeg: -20,
          scale: [1, 1, 1],
          pose: "prone",
          actionPlaying: true,
        },
      ],
    },
  };
  const expected = {
    ...input,
    layout3d: {
      ...input.layout3d,
      camera: {
        ...input.layout3d.camera,
        fovDeg: 52,
        nearClip: 0.05,
        farClip: 200,
        depthOfFieldEnabled: false,
        focusDistance: 8,
        focusRange: 5,
        blurRadius: 3,
      },
      actors: input.layout3d.actors.map((actor) => ({ ...actor, actionPlaying: false })),
    },
  };
  assert.deepEqual(normalizeBlockingSketchData(input), expected);
});

test("3D 角色颜色会随布局保存，并拒绝超出 RGB 范围的值", () => {
  const layout3d = {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
    actors: [{
      characterName: "沈烬",
      position: [0, 0, 0],
      yawDeg: 0,
      scale: [1, 1, 1],
      pose: "standing",
      actionPlaying: false,
      color: [0.2, 0.4, 0.8],
    }],
  };
  const normalized = normalizeBlockingSketchData({ ...validSketch, layout3d });
  assert.deepEqual(normalized.layout3d?.actors[0]?.color, [0.2, 0.4, 0.8]);
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      layout3d: { ...layout3d, actors: [{ ...layout3d.actors[0], color: [1.1, 0, 0] }] },
    }),
    /颜色/,
  );
});

test("3D 摆位快照拒绝越界位置和未知姿势", () => {
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      layout3d: {
        schemaVersion: 1,
        engine: "playcanvas",
        camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
        actors: [{
          characterName: "沈烬",
          position: [0, -1, 0],
          yawDeg: 0,
          scale: [1, 1, 1],
          pose: "standing",
          actionPlaying: true,
        }],
      },
    }),
    /高度/,
  );
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      layout3d: {
        schemaVersion: 1,
        engine: "playcanvas",
        camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
        actors: [{
          characterName: "沈烬",
          position: [0, 0, 0],
          yawDeg: 0,
          scale: [1, 1, 1],
          pose: "unknown",
          actionPlaying: true,
        }],
      },
    }),
    /姿势/,
  );
});

test("3D 摆位身高统一支持 0.50 到 10.00 米", () => {
  assert.deepEqual(BLOCKING_SKETCH_3D_LIMITS.heightMeters, { min: 0.5, max: 10 });
  const normalized = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
      actors: [{
        characterName: "血角兽",
        position: [0, 0, 0],
        yawDeg: 0,
        scale: [1, 1, 1],
        heightMeters: 5,
        pose: "standing",
        actionPlaying: false,
      }],
    },
  });
  assert.equal(normalized.layout3d?.actors[0]?.heightMeters, 5);
  assert.throws(
    () => normalizeBlockingSketchData({
      ...validSketch,
      layout3d: {
        ...normalized.layout3d,
        actors: [{ ...normalized.layout3d.actors[0], heightMeters: 10.01 }],
      },
    }),
    /身高基准/,
  );
});

test("旧的动作播放标记会归一化为静态关键帧", () => {
  const normalized = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
      actors: [{
        characterName: "沈烬",
        position: [0, 0, 0],
        yawDeg: 0,
        scale: [1, 1, 1],
        pose: "standing",
        actionPlaying: true,
      }],
    },
  });

  assert.equal(normalized.layout3d?.actors[0]?.actionPlaying, false);
});

test("3D 摆位保存 HDRI 环境参数，并兼容没有环境字段的旧快照", () => {
  const layout3d = {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
    actors: [],
    environment: {
      projectionCenterHeight: 1.2,
      domeRadius: 20,
      panoramaHorizonV: 0.58,
      yawDeg: -25,
      intensity: 1.1,
    },
  };
  const normalized = normalizeBlockingSketchData({ ...validSketch, layout3d });
  assert.deepEqual(normalized.layout3d?.environment, {
    projectionCenterHeight: layout3d.environment.projectionCenterHeight,
    domeRadius: layout3d.environment.domeRadius,
    panoramaHorizonV: layout3d.environment.panoramaHorizonV,
    yawDeg: 0,
    intensity: 1,
  });
  const normalizedLegacy = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...layout3d,
      environment: {
        projectionCenterHeight: layout3d.environment.projectionCenterHeight,
        domeRadius: layout3d.environment.domeRadius,
        yawDeg: layout3d.environment.yawDeg,
        intensity: layout3d.environment.intensity,
        groundTextureScale: 10,
      },
    },
  });
  assert.equal(normalizedLegacy.layout3d?.environment?.projectionCenterHeight, normalized.layout3d?.environment?.projectionCenterHeight);
  assert.equal(normalizedLegacy.layout3d?.environment?.domeRadius, normalized.layout3d?.environment?.domeRadius);
  assert.equal(normalizedLegacy.layout3d?.environment?.panoramaHorizonV, 0.5);
  assert.equal(normalizeBlockingSketchData({ ...validSketch, layout3d: { ...layout3d, environment: undefined } }).layout3d?.environment, undefined);
});

test("3D 相机兼容旧快照并保存镜头与景深参数", () => {
  const old = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: { azim: 0, elev: -12, distance: 4, focalPoint: [0, 0.8, 0] },
      actors: [],
    },
  });
  assert.deepEqual(old.layout3d?.camera, {
    azim: 0,
    elev: -12,
    distance: 4,
    focalPoint: [0, 0.8, 0],
    fovDeg: 52,
    nearClip: 0.05,
    farClip: 200,
    depthOfFieldEnabled: false,
    focusDistance: 8,
    focusRange: 5,
    blurRadius: 3,
  });

  const next = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...old.layout3d,
      camera: {
        ...old.layout3d?.camera,
        fovDeg: 38,
        nearClip: 0.1,
        farClip: 120,
        depthOfFieldEnabled: true,
        focusDistance: 4.5,
        focusRange: 2.25,
        blurRadius: 4,
      },
    },
  });
  assert.equal(next.layout3d?.camera.depthOfFieldEnabled, true);
  assert.equal(next.layout3d?.camera.focusDistance, 4.5);
  assert.equal(next.layout3d?.camera.blurRadius, 4);
});

test("3D 相机拒绝越界景深字段", () => {
  assert.throws(() => normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: {
        azim: 0,
        elev: 0,
        distance: 3,
        focalPoint: [0, 0, 0],
        fovDeg: 120,
        nearClip: 0.01,
        farClip: 200,
        depthOfFieldEnabled: true,
        focusDistance: 3,
        focusRange: 2,
        blurRadius: 3,
      },
      actors: [],
    },
  }), /3D 相机/);
});

test("HDRI 环境参数拒绝超出视口可控范围的值", () => {
  const baseLayout = {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
    actors: [],
    environment: {
      projectionCenterHeight: 1,
      domeRadius: 15,
      panoramaHorizonV: 0.5,
      yawDeg: 0,
      intensity: 1,
    },
  };
  for (const [key, value] of [
    ["projectionCenterHeight", 0.5],
    ["projectionCenterHeight", 10.1],
    ["domeRadius", 4],
    ["domeRadius", 100.1],
    ["panoramaHorizonV", 0.39],
    ["panoramaHorizonV", 0.66],
    ["yawDeg", 181],
    ["intensity", 2],
  ]) {
    assert.throws(
      () => normalizeBlockingSketchData({
        ...validSketch,
        layout3d: { ...baseLayout, environment: { ...baseLayout.environment, [key]: value } },
      }),
      /HDRI 环境/,
    );
  }
  const atUpperBoundary = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...baseLayout,
      environment: { ...baseLayout.environment, projectionCenterHeight: 10, domeRadius: 30 },
    },
  });
  assert.equal(atUpperBoundary.layout3d?.environment?.projectionCenterHeight, 10);
  assert.equal(atUpperBoundary.layout3d?.environment?.domeRadius, 30);
  const atLowerBoundary = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...baseLayout,
      environment: { ...baseLayout.environment, domeRadius: 5 },
    },
  });
  assert.equal(atLowerBoundary.layout3d?.environment?.domeRadius, 5);
  const aboveNewBoundary = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...baseLayout,
      environment: { ...baseLayout.environment, domeRadius: 31 },
    },
  });
  assert.equal(aboveNewBoundary.layout3d?.environment?.domeRadius, 30);
  const atHorizonBoundaries = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: { ...baseLayout, environment: { ...baseLayout.environment, panoramaHorizonV: 0.65 } },
  });
  assert.equal(atHorizonBoundaries.layout3d?.environment?.panoramaHorizonV, 0.65);
});

test("旧 HDRI 范围内的快照会裁剪到新范围，不会使整张 3D 摆位失效", () => {
  const legacy = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
      actors: [],
      environment: {
        projectionCenterHeight: 0.6,
        domeRadius: 96,
        panoramaHorizonV: 0.5,
        yawDeg: 80,
        intensity: 1.5,
      },
    },
  });
  assert.equal(legacy.layout3d?.environment?.projectionCenterHeight, 1);
  assert.equal(legacy.layout3d?.environment?.domeRadius, 30);
  assert.equal(legacy.layout3d?.environment?.panoramaHorizonV, 0.5);
  assert.equal(legacy.layout3d?.environment?.yawDeg, 0);
  assert.equal(legacy.layout3d?.environment?.intensity, 1);
});
