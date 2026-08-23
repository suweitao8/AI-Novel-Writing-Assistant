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
