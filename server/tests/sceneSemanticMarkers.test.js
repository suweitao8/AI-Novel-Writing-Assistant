import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoryScene3dMarkerSet,
  parseStoryScene3dMarkerSet,
} from "../src/modules/novel/story-settings/application/StoryScene3dMarkers.ts";
import { normalizeStoryAssetStates } from "@ai-novel/shared/types/novelReferenceExtraction";

const validMarkerSet = {
  schemaVersion: 1,
  status: "ready",
  sourceImageArtifactId: "artifact-1",
  markers: [
    {
      id: "marker-1",
      kind: "bed",
      label: "双人床",
      anchor: "floor",
      position: [9, 99, -9],
      size: [2.2, 0.8, 2],
      yawDeg: 20,
      confidence: 0.82,
      imageRegion: { x: 0.2, y: 0.38, width: 0.24, height: 0.2 },
      evidence: "靠墙的床面和床头结构",
    },
  ],
};

test("场景 3D 标记按当前半球范围归一化，并让地面长方体落地", () => {
  const normalized = normalizeStoryScene3dMarkerSet(validMarkerSet, { maxRadius: 6 });
  assert.equal(normalized?.status, "ready");
  assert.deepEqual(normalized?.markers[0]?.position, [6, 0.4, -6]);
  assert.deepEqual(normalized?.markers[0]?.size, [2.2, 0.8, 2]);
  assert.equal(normalized?.markers[0]?.confidence, 0.82);
});

test("旧状态没有空间标记时保持兼容，非法标记不会让整份状态失效", () => {
  assert.equal(parseStoryScene3dMarkerSet(null), null);
  assert.equal(parseStoryScene3dMarkerSet("not-json"), null);
  const states = normalizeStoryAssetStates([{
    id: "initial",
    label: "默认",
    description: "卧室",
    imagePrompt: "卧室",
    scene3dMarkers: { status: "broken", markers: "not-an-array" },
  }]);
  assert.equal(states.length, 1);
  assert.equal(states[0]?.scene3dMarkers, undefined);
});

test("室外或自然场景允许 AI 返回空标记集合", () => {
  const normalized = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: [],
  });
  assert.deepEqual(normalized?.markers, []);
});

test("重复标记 ID 会被归一化为稳定的唯一 ID", () => {
  const normalized = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: [
      { ...validMarkerSet.markers[0], id: "same" },
      { ...validMarkerSet.markers[0], id: "same", label: "另一张桌子" },
    ],
  });
  assert.deepEqual(normalized?.markers.map((marker) => marker.id), ["same", "same-2"]);
});
