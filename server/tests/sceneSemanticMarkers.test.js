import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStoryScene3dMarkerSet,
  parseStoryScene3dMarkerSet,
  adoptLegacyStoryScene3dMarkerEnvironment,
} from "../src/modules/novel/story-settings/application/StoryScene3dMarkers.ts";
import { projectStoryScene3dMarkerFromImageRegion } from "@ai-novel/shared/utils/scene3dProjection";
import { normalizeStoryAssetStates } from "@ai-novel/shared/types/novelReferenceExtraction";
import { isStoryScene3DMarkerSetCurrent as isCurrentMarkerSet } from "@ai-novel/shared/types/comicDrama";

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
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
  const project = (entry) => projectStoryScene3dMarkerFromImageRegion(entry, environment).position;
  const front = project(marker);
  const left = project({
    ...marker,
    imageRegion: { ...marker.imageRegion, x: 0.15 },
  });

  assert.ok(Math.abs(front[0]) < 0.05, "全景水平中心应落在世界 Z 轴附近");
  assert.ok(front[2] > 0, "全景水平中心应落在 +Z 正前方");
  assert.ok(left[0] < -0.1, "图像左侧物体应落在世界 -X 侧");
  assert.ok(Math.abs(left[2]) < 0.1, "四分之一经度应接近世界 X 轴");
  assert.notDeepEqual(front, marker.position, "不能继续直接保存模型给出的世界坐标");
});

test("默认 50% 全景中家具框底在地平线上方时用类别高度跨度反算深度", () => {
  const marker = {
    anchor: "floor",
    position: [0, 0.5, 0],
    size: [1.2, 0.8, 0.8],
    imageRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.16 },
  };
  const projected = projectStoryScene3dMarkerFromImageRegion(marker, environment).position;

  // 类别 other 的典型高度 1.6m ÷ 垂直跨度 tan(0.6283)-tan(0.1257)。
  const expectedRadius = 1.6 / (Math.tan(Math.PI * 0.2) - Math.tan(Math.PI * 0.04));
  assert.ok(Math.abs(projected[0]) < 0.05, "水平中心仍应保持在世界 Z 轴附近");
  assert.ok(
    Math.abs(Math.hypot(projected[0], projected[2]) - expectedRadius) < 0.02,
    "框底没有落地证据时应按类别高度与跨度反算深度",
  );
  assert.ok(Math.hypot(projected[0], projected[2]) > 1, "不能塌缩回投射中心脚下");
  assert.ok(projected[1] > 0.1, "图片证据参与尺寸校准后仍必须落地");
});

test("投射中心高度、半球直径和全景分界都会参与标记反算", () => {
  const marker = {
    anchor: "wall",
    position: [2, 2, -2],
    size: [1, 2, 1],
    // 垂直跨度小到没有深度证据，深度只能来自半球参考半径。
    imageRegion: { x: 0.4, y: 0.32, width: 0.2, height: 0.01 },
  };
  const project = (entryEnvironment) => projectStoryScene3dMarkerFromImageRegion(marker, entryEnvironment).position;
  const compact = project(environment);
  const expanded = project({
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
    panoramaHorizonV: 0.58,
  });
  const expandedWithDefaultHorizon = project({
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
  });
  const expandedAtCenterHorizon = project({
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
    panoramaHorizonV: 0.5,
  });
  const shifted = project({
    ...environment,
    projectionCenterHeight: 4,
    domeRadius: 30,
    panoramaHorizonV: 0.65,
  });

  assert.ok(expanded[1] > compact[1], "投射中心升高后墙面标记高度应随之变化");
  assert.ok(expanded[2] > compact[2], "半球直径变化后同一图像位置的深度应重新估算");
  assert.deepEqual(expandedWithDefaultHorizon, expandedAtCenterHorizon, "缺失分界值应回退到 50% 投射");
  assert.notDeepEqual(shifted, expanded, "分界变化后同一图像区域应重新计算高度");
  assert.notDeepEqual(expanded, compact, "环境参数变化不能继续复用旧的世界坐标");
});

test("空间标记没有匹配当前环境快照时必须失效，不能流入分镜摆位", () => {
  const markerSet = {
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: {
      projectionCenterHeight: 2,
      domeRadius: 15,
      panoramaHorizonV: 0.5,
    },
    markers: [],
  };
  assert.equal(isCurrentMarkerSet(markerSet, environment), true);
  assert.equal(isCurrentMarkerSet(markerSet, { ...environment, domeRadius: 30 }), false);
  assert.equal(isCurrentMarkerSet({ ...markerSet, sourceEnvironment: undefined }, environment), false);
  assert.equal(isCurrentMarkerSet({ ...markerSet, sourceEnvironment: { ...markerSet.sourceEnvironment, panoramaHorizonV: 0.58 } }, environment), false);
});

test("空间标记环境快照的半球直径归一化到 5 到 30", () => {
  const normalized = parseStoryScene3dMarkerSet(JSON.stringify({
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: { projectionCenterHeight: 2, domeRadius: 31 },
    markers: [],
  }));
  assert.equal(normalized?.sourceEnvironment?.domeRadius, 30);
  assert.equal(normalized?.sourceEnvironment?.panoramaHorizonV, 0.5);
  const lower = parseStoryScene3dMarkerSet(JSON.stringify({
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: { projectionCenterHeight: 2, domeRadius: 4 },
    markers: [],
  }));
  assert.equal(lower?.sourceEnvironment?.domeRadius, 5);
  const upperHorizon = parseStoryScene3dMarkerSet(JSON.stringify({
    schemaVersion: 1,
    status: "ready",
    sourceEnvironment: { projectionCenterHeight: 2, domeRadius: 15, panoramaHorizonV: 0.9 },
    markers: [],
  }));
  assert.equal(upperHorizon?.sourceEnvironment?.panoramaHorizonV, 0.65);
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
    panoramaHorizonV: 0.5,
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
