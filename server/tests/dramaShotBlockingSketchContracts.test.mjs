import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_SKETCH_CANVAS,
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
      actors: input.layout3d.actors.map((actor) => ({ ...actor, actionPlaying: false })),
    },
  };
  assert.deepEqual(normalizeBlockingSketchData(input), expected);
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
      domeRadius: 48,
      yawDeg: -25,
      intensity: 1.1,
    },
  };
  const normalized = normalizeBlockingSketchData({ ...validSketch, layout3d });
  assert.deepEqual(normalized.layout3d?.environment, {
    ...layout3d.environment,
    yawDeg: 0,
    intensity: 1,
  });
  const normalizedLegacy = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: { ...layout3d, environment: { ...layout3d.environment, groundTextureScale: 10 } },
  });
  assert.deepEqual(normalizedLegacy.layout3d?.environment, normalized.layout3d?.environment);
  assert.equal(normalizeBlockingSketchData({ ...validSketch, layout3d: { ...layout3d, environment: undefined } }).layout3d?.environment, undefined);
});

test("HDRI 环境参数拒绝超出视口可控范围的值", () => {
  const baseLayout = {
    schemaVersion: 1,
    engine: "playcanvas",
    camera: { azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0] },
    actors: [],
    environment: {
      projectionCenterHeight: 1,
      domeRadius: 48,
      yawDeg: 0,
      intensity: 1,
    },
  };
  for (const [key, value] of [
    ["projectionCenterHeight", 0.5],
    ["projectionCenterHeight", 10.1],
    ["domeRadius", 9],
    ["domeRadius", 100.1],
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
      environment: { ...baseLayout.environment, projectionCenterHeight: 10, domeRadius: 50 },
    },
  });
  assert.equal(atUpperBoundary.layout3d?.environment?.projectionCenterHeight, 10);
  assert.equal(atUpperBoundary.layout3d?.environment?.domeRadius, 50);
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
        yawDeg: 80,
        intensity: 1.5,
      },
    },
  });
  assert.equal(legacy.layout3d?.environment?.projectionCenterHeight, 1);
  assert.equal(legacy.layout3d?.environment?.domeRadius, 50);
  assert.equal(legacy.layout3d?.environment?.yawDeg, 0);
  assert.equal(legacy.layout3d?.environment?.intensity, 1);
});
