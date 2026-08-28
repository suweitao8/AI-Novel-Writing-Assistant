import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSceneStates } from "../../shared/utils/storyAssetSceneStates.ts";
import { STORY_SCENE_3D_MARKERS_ENABLED } from "../../shared/utils/scene3dMarkers.ts";

test("空间标记功能关闭：场景状态归一化丢弃 scene3dMarkers", () => {
  assert.equal(STORY_SCENE_3D_MARKERS_ENABLED, false);

  const states = normalizeSceneStates(
    [
      {
        id: "state-1",
        label: "白天",
        description: "空房间",
        scene3dMarkers: {
          schemaVersion: 1,
          status: "ready",
          markers: [
            {
              id: "marker-1",
              kind: "bed",
              label: "双人床",
              anchor: "floor",
              position: [1, 0, 1],
              size: [2, 0.5, 1.5],
              yawDeg: 0,
              confidence: 0.9,
            },
          ],
        },
      },
    ],
    { name: "卧室" },
  );

  assert.equal(states.length, 1);
  assert.equal(states[0].id, "state-1");
  assert.equal("scene3dMarkers" in states[0], false);
});

test("空间标记功能关闭：没有标记的状态归一化不受影响", () => {
  const states = normalizeSceneStates(
    [{ id: "state-1", label: "白天", description: "空房间" }],
    { name: "卧室", sceneType: "interior" },
  );
  assert.equal(states.length, 1);
  assert.equal(states[0].label, "白天");
  assert.equal(states[0].sceneType, "interior");
});
