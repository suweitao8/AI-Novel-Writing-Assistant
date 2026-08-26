import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoryScene3dMarkerSet,
  parseStoryScene3dMarkerSet,
  projectStoryScene3dMarkerPosition,
  adoptLegacyStoryScene3dMarkerEnvironment,
} from "../src/modules/novel/story-settings/application/StoryScene3dMarkers.ts";
import { normalizeStoryAssetStates } from "@ai-novel/shared/types/novelReferenceExtraction";
import { isStoryScene3DMarkerSetCurrent as isCurrentMarkerSet } from "@ai-novel/shared/types/comicDrama";

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  yawDeg: 0,
  intensity: 1,
};

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

test("读取场景标记时用图像区域纠正门窗经度侧，手工标记保持不变", () => {
  const normalized = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: [
      {
        ...validMarkerSet.markers[0],
        kind: "door",
        anchor: "wall",
        position: [3.3, 1.15, 0.6],
        size: [0.9, 2.3, 0.12],
        yawDeg: -90,
        imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.32 },
      },
      {
        ...validMarkerSet.markers[0],
        id: "manual-window",
        kind: "window",
        anchor: "wall",
        source: "manual",
        position: [-1, 1.5, 2],
        imageRegion: { x: 0.45, y: 0.36, width: 0.1, height: 0.22 },
      },
    ],
  }, {
    maxRadius: 6,
    environment,
  });
  const door = normalized?.markers[0];
  assert.ok(door);
  assert.ok(door.position[0] > 0);
  assert.ok(door.position[2] < 0);
  assert.ok(door.yawDeg > 90);
  assert.deepEqual(normalized?.markers[1]?.position, [-1, 1.5, 2]);
});

test("空间标记优先使用图像区域反算水平位置，而不是直接采信模型世界坐标", () => {
  const marker = {
    anchor: "floor",
    position: [9, 0.5, -9],
    size: [2, 1, 2],
    imageRegion: { x: 0.4, y: 0.65, width: 0.2, height: 0.2 },
  };
  const front = projectStoryScene3dMarkerPosition(marker, environment);
  const left = projectStoryScene3dMarkerPosition({
    ...marker,
    imageRegion: { ...marker.imageRegion, x: 0.15 },
  }, environment);

  assert.ok(Math.abs(front[0]) < 0.05, "全景水平中心应落在世界 Z 轴附近");
  assert.ok(front[2] > 0, "全景水平中心应落在 +Z 正前方");
  assert.ok(left[0] < -0.1, "图像左侧物体应落在世界 -X 侧");
  assert.ok(Math.abs(left[2]) < 0.1, "四分之一经度应接近世界 X 轴");
  assert.notDeepEqual(front, marker.position, "不能继续直接保存模型给出的世界坐标");
});

test("固定 50% 全景中家具框底在地平线上方时仍落在半球地面外圈", () => {
  const marker = {
    anchor: "floor",
    position: [0, 0.5, 0],
    size: [1.2, 0.8, 0.8],
    imageRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.16 },
  };
  const projected = projectStoryScene3dMarkerPosition(marker, environment);

  assert.ok(Math.abs(projected[0]) < 0.05, "水平中心仍应保持在世界 Z 轴附近");
  assert.ok(projected[2] > 6.6, "地面物体应落在当前半球的可用外圈，而不是球体中心");
  assert.equal(projected[1], 0.4, "floor 标记中心高度应由物体尺寸决定");
});

test("投射中心高度和半球直径会参与标记反算，历史分界值不再改变结果", () => {
  const marker = {
    anchor: "wall",
    position: [2, 2, -2],
    size: [1, 2, 1],
    imageRegion: { x: 0.4, y: 0.32, width: 0.2, height: 0.16 },
  };
  const compact = projectStoryScene3dMarkerPosition(marker, environment);
  const expanded = projectStoryScene3dMarkerPosition(marker, {
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
    panoramaHorizonV: 0.58,
  });
  const expandedWithoutLegacyHorizon = projectStoryScene3dMarkerPosition(marker, {
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
  });

  assert.ok(expanded[1] > compact[1], "投射中心升高后墙面标记高度应随之变化");
  assert.ok(expanded[2] > compact[2], "半球直径变化后同一图像位置的深度应重新估算");
  assert.deepEqual(expanded, expandedWithoutLegacyHorizon, "历史分界值不能改变固定 50% 投射");
  assert.notDeepEqual(expanded, compact, "环境参数变化不能继续复用旧的世界坐标");
});

test("空间标记没有匹配当前环境快照时必须失效，不能流入分镜摆位", () => {
  const markerSet = {
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: {
      projectionCenterHeight: 2,
      domeRadius: 15,
    },
    markers: [],
  };
  assert.equal(isCurrentMarkerSet(markerSet, environment), true);
  assert.equal(isCurrentMarkerSet(markerSet, { ...environment, domeRadius: 30 }), false);
  assert.equal(isCurrentMarkerSet({ ...markerSet, sourceEnvironment: undefined }, environment), false);
});

test("旧 AI 标记有完整图像区域时迁移当前环境，无图像证据仍保持过期", () => {
  const legacyMarkerSet = normalizeStoryScene3dMarkerSet({
    schemaVersion: 1,
    status: "ready",
    markers: [{
      id: "door",
      kind: "door",
      label: "房门",
      anchor: "wall",
      position: [3, 2, 1],
      size: [1, 2, 0.1],
      yawDeg: 0,
      confidence: 0.9,
      source: "ai",
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.32 },
    }],
  }, { environment });
  const migrated = adoptLegacyStoryScene3dMarkerEnvironment(legacyMarkerSet, environment);
  assert.deepEqual(migrated?.sourceEnvironment, {
    projectionCenterHeight: 2,
    domeRadius: 15,
  });
  assert.ok((migrated?.markers[0]?.position[0] ?? 0) > 0);

  const coordinateOnly = adoptLegacyStoryScene3dMarkerEnvironment(
    normalizeStoryScene3dMarkerSet({
      schemaVersion: 1,
      status: "ready",
      markers: [{
        id: "door",
        kind: "door",
        label: "房门",
        anchor: "wall",
        position: [3, 2, 1],
        size: [1, 2, 0.1],
        yawDeg: 0,
        confidence: 0.9,
        source: "ai",
      }],
    }, { environment }),
    environment,
  );
  assert.equal(coordinateOnly?.sourceEnvironment, undefined);
});
