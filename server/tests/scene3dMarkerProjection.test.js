const assert = require("node:assert/strict");
const test = require("node:test");

const {
  equirectangularRegionCenterToHorizontalDirection,
  projectStoryScene3dMarkerFromImageRegion,
  projectStoryScene3dMarkerSetFromImageRegions,
  resolveStoryScene3dWallClusters,
  STORY_SCENE_3D_MARKER_SIZE_POLICIES,
} = require("../../shared/dist/utils/scene3dProjection.js");

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
};

const FALLBACK_RADIUS = 15 * 0.45;

function marker(overrides = {}) {
  return {
    kind: "door",
    label: "房门",
    anchor: "wall",
    position: [3.3, 1.15, 0.6],
    size: [0.9, 2.3, 0.12],
    yawDeg: -90,
    confidence: 0.9,
    imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.32 },
    ...overrides,
  };
}

function horizontalRadius(position) {
  return Math.hypot(position[0], position[2]);
}

/** 把世界坐标里的真实物体渲染回等距柱状图的归一化框（合成证据用）。 */
function regionForBox({ centerU, width, bottomY, topY, radius, projectionCenterHeight }) {
  const latitudeAt = (y) => Math.atan2(y - projectionCenterHeight, radius);
  const vAt = (latitude) => 0.5 - latitude / Math.PI;
  return {
    x: centerU - width / 2,
    y: vAt(latitudeAt(topY)),
    width,
    height: vAt(latitudeAt(bottomY)) - vAt(latitudeAt(topY)),
  };
}

test("等距柱状图中心经度映射到世界水平径向方向", () => {
  const front = equirectangularRegionCenterToHorizontalDirection({
    x: 0.45,
    y: 0.4,
    width: 0.1,
    height: 0.2,
  });
  assert.ok(Math.abs(front.x) < 1e-9);
  assert.ok(front.z > 0.999);

  const rightSide = equirectangularRegionCenterToHorizontalDirection({
    x: 0.78,
    y: 0.34,
    width: 0.06,
    height: 0.32,
  });
  assert.ok(rightSide.x > 0);
  assert.ok(rightSide.z < 0);
  assert.ok(rightSide.azimuthDeg > 90);
});

test("门的框底部落地线直接反算墙面深度，而不是贴到参考半径", () => {
  // 真实门：正前方 2.5m 的墙上，高 2.2m、落地。
  const doorRegion = regionForBox({
    centerU: 0.5,
    width: 0.08,
    bottomY: 0,
    topY: 2.2,
    radius: 2.5,
    projectionCenterHeight: 2,
  });
  const projected = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "door",
      label: "房门",
      imageRegion: doorRegion,
    }),
    environment,
    FALLBACK_RADIUS,
  );
  assert.ok(
    Math.abs(horizontalRadius(projected.position) - 2.5) < 0.05,
    `门应落在图像证据反算的 2.5m 墙面上，实际 ${horizontalRadius(projected.position)}`,
  );
  assert.ok(horizontalRadius(projected.position) < FALLBACK_RADIUS - 2);
  assert.ok(Math.abs(projected.position[0]) < 0.05, "正前方门保持在世界 Z 轴附近");
  assert.ok(projected.position[2] > 0);
  assert.equal(projected.position[1], projected.size[1] / 2, "门应整段落在地面上");
  const policy = STORY_SCENE_3D_MARKER_SIZE_POLICIES.door;
  assert.ok(projected.size[1] >= policy.y[0] && projected.size[1] <= policy.y[1]);
});

test("同面墙的窗与门共享统一墙距，孤立窗退回类别高度反算", () => {
  const doorRegion = regionForBox({
    centerU: 0.5,
    width: 0.08,
    bottomY: 0,
    topY: 2.2,
    radius: 2.5,
    projectionCenterHeight: 2,
  });
  // 同一面墙上的窗：窗台 0.9m、顶 2.1m。
  const windowRegion = regionForBox({
    centerU: 0.5,
    width: 0.1,
    bottomY: 0.9,
    topY: 2.1,
    radius: 2.5,
    projectionCenterHeight: 2,
  });
  const markers = [
    marker({ kind: "door", label: "房门", imageRegion: doorRegion }),
    marker({
      kind: "window",
      label: "窗户",
      anchor: "wall",
      size: [1.4, 1.2, 0.1],
      imageRegion: windowRegion,
    }),
  ];
  const projected = projectStoryScene3dMarkerSetFromImageRegions(markers, environment, {
    maxRadius: FALLBACK_RADIUS,
  });
  const doorRadius = horizontalRadius(projected[0].position);
  const windowRadius = horizontalRadius(projected[1].position);
  assert.ok(Math.abs(doorRadius - 2.5) < 0.05);
  assert.ok(
    Math.abs(windowRadius - doorRadius) < 1e-6,
    "同一方位聚类后，窗必须与门共享同一墙距",
  );
  // 孤立窗没有门的落地证据，退回类别典型高度的跨度反算。
  const loneWindow = projectStoryScene3dMarkerFromImageRegion(
    markers[1],
    environment,
    FALLBACK_RADIUS,
  );
  const expectedSpan = 1.6 / (Math.tan(Math.atan2(0.1, 2.5)) + Math.tan(Math.atan2(1.1, 2.5)));
  assert.ok(
    Math.abs(horizontalRadius(loneWindow.position) - expectedSpan) < 0.02,
    "孤立窗按类别高度与垂直跨度反算深度",
  );
  assert.ok(horizontalRadius(loneWindow.position) > 0.8, "窗不能塌缩回投射中心");
});

test("无图像深度证据的墙面物体仍落到稳定参考半径", () => {
  const projected = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "window",
      label: "北墙窗户",
      position: [0, 1.2, 0],
      size: [1, 1, 0.1],
      // 垂直跨度小到无法反算，只剩回退半径。
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.005 },
    }),
    environment,
    6,
  );
  assert.ok(Math.abs(horizontalRadius(projected.position) - 6) < 1e-9);
});

test("床桌椅的图片区域参与尺寸校准，并且结果落在类别范围", () => {
  const cases = [
    "bed",
    "table",
    "chair",
  ];
  for (const kind of cases) {
    const projected = projectStoryScene3dMarkerFromImageRegion(
      marker({
        kind,
        label: String(kind),
        anchor: "floor",
        position: [0, 12, 0],
        size: [30, 30, 30],
        imageRegion: { x: 0.35, y: 0.32, width: 0.14, height: 0.2 },
      }),
      environment,
      6,
    );
    const policy = STORY_SCENE_3D_MARKER_SIZE_POLICIES[kind];
    assert.ok(projected.size[0] >= policy.x[0] && projected.size[0] <= policy.x[1]);
    assert.ok(projected.size[1] >= policy.y[0] && projected.size[1] <= policy.y[1]);
    assert.ok(projected.size[2] >= policy.z[0] && projected.size[2] <= policy.z[1]);
    assert.equal(projected.position[1], projected.size[1] / 2);
    assert.notDeepEqual(projected.size, [30, 30, 30]);
  }
});

test("家具深度用落地线、顶边和跨高多估计量取中位数，框底偏移不再把家具推到外圈", () => {
  // 真实家具：前方 2m 处、高 0.775m 的床；模型框底比真实落地线高 0.05 个 v。
  const tightRegion = regionForBox({
    centerU: 0.5,
    width: 0.14,
    bottomY: 0,
    topY: 0.775,
    radius: 2,
    projectionCenterHeight: 2,
  });
  const looseRegion = {
    ...tightRegion,
    height: tightRegion.height - 0.05,
  };
  const projected = projectStoryScene3dMarkerSetFromImageRegions(
    [
      marker({
        kind: "bed",
        label: "床",
        anchor: "floor",
        size: [2, 0.775, 2],
        imageRegion: looseRegion,
      }),
    ],
    environment,
    { maxRadius: FALLBACK_RADIUS },
  );
  const radius = horizontalRadius(projected[0].position);
  assert.ok(
    radius < 3.2,
    `框底抬高后床不应被推到远端（旧算法会趋近 ${FALLBACK_RADIUS}），实际 ${radius}`,
  );
  assert.ok(radius > 1.4, "床也不能塌缩到投射中心脚下");
  assert.equal(projected[0].position[1], projected[0].size[1] / 2);
});

test("家具不能越过所在方位的墙面", () => {
  const doorRegion = regionForBox({
    centerU: 0.5,
    width: 0.08,
    bottomY: 0,
    topY: 2.2,
    radius: 2.5,
    projectionCenterHeight: 2,
  });
  // 床在 4.5m 处，但同方位墙面证据只有 2.5m。
  const bedRegion = regionForBox({
    centerU: 0.5,
    width: 0.14,
    bottomY: 0,
    topY: 0.775,
    radius: 4.5,
    projectionCenterHeight: 2,
  });
  const projected = projectStoryScene3dMarkerSetFromImageRegions(
    [
      marker({ kind: "door", label: "房门", imageRegion: doorRegion }),
      marker({
        kind: "bed",
        label: "床",
        anchor: "floor",
        size: [2, 0.775, 2],
        imageRegion: bedRegion,
      }),
    ],
    environment,
    { maxRadius: FALLBACK_RADIUS },
  );
  const doorRadius = horizontalRadius(projected[0].position);
  const bedRadius = horizontalRadius(projected[1].position);
  assert.ok(bedRadius <= doorRadius + 1e-9, "床不能越过同方位墙面的深度");
  assert.ok(bedRadius > 1, "墙内侧仍保留可摆位深度");
});

test("方位聚类只统一同一面墙，不吞并对面墙", () => {
  const frontDoor = regionForBox({
    centerU: 0.5,
    width: 0.08,
    bottomY: 0,
    topY: 2.2,
    radius: 2.5,
    projectionCenterHeight: 2,
  });
  const rearDoor = regionForBox({
    centerU: 0.0,
    width: 0.08,
    bottomY: 0,
    topY: 2.2,
    radius: 4,
    projectionCenterHeight: 2,
  });
  const clusters = resolveStoryScene3dWallClusters(
    [
      marker({ kind: "door", label: "前门", imageRegion: frontDoor }),
      marker({ kind: "door", label: "后门", imageRegion: rearDoor }),
    ],
    environment,
    FALLBACK_RADIUS,
  );
  assert.equal(clusters.length, 2, "正前方与正后方的门必须分属两簇");
  const radii = clusters.map((cluster) => cluster.radius).sort((a, b) => a - b);
  assert.ok(Math.abs(radii[0] - 2.5) < 0.05);
  assert.ok(Math.abs(radii[1] - 4) < 0.05);
});

test("地面物体的图片框宽度会改变占地宽度，且手工标记和缺失区域保持原几何", () => {
  const narrow = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "chair",
      anchor: "floor",
      position: [2.6, 0.38, 2.2],
      size: [1.2, 0.76, 0.6],
      imageRegion: { x: 0.495, y: 0.32, width: 0.01, height: 0.12 },
    }),
    environment,
    6,
  );
  const wide = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "chair",
      anchor: "floor",
      position: [2.6, 0.38, 2.2],
      size: [1.2, 0.76, 0.6],
      imageRegion: { x: 0.47, y: 0.32, width: 0.06, height: 0.12 },
    }),
    environment,
    6,
  );
  assert.ok(wide.size[0] > narrow.size[0]);

  const floor = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "table",
      label: "书桌",
      anchor: "floor",
      position: [2.6, 0.38, 2.2],
      size: [1.2, 0.76, 0.6],
      yawDeg: -90,
      imageRegion: { x: 0.6, y: 0.5, width: 0.1, height: 0.12 },
    }),
    environment,
    6,
  );
  assert.equal(floor.position[1], floor.size[1] / 2);
  assert.equal(floor.yawDeg, -90);

  const manual = projectStoryScene3dMarkerFromImageRegion(
    marker({ source: "manual", position: [1, 1, 1] }),
    environment,
    6,
  );
  assert.deepEqual(manual.position, [1, 1, 1]);
  assert.deepEqual(manual.size, [0.9, 2.3, 0.12]);
  assert.equal(manual.yawDeg, -90);

  const withoutRegion = projectStoryScene3dMarkerFromImageRegion(
    marker({ imageRegion: undefined, position: [1, 2, 3] }),
    environment,
    6,
  );
  assert.deepEqual(withoutRegion.position, [1, 2, 3]);
  assert.deepEqual(withoutRegion.size, [0.9, 2.3, 0.12]);

  const setWithManual = projectStoryScene3dMarkerSetFromImageRegions(
    [
      marker({ source: "manual", position: [1, 1, 1] }),
      marker({ imageRegion: undefined, position: [1, 2, 3] }),
    ],
    environment,
    { maxRadius: 6 },
  );
  assert.deepEqual(setWithManual[0].position, [1, 1, 1]);
  assert.deepEqual(setWithManual[1].position, [1, 2, 3]);
});

test("重复投影是幂等的，不会让 marker 继续漂移或反复改变尺寸", () => {
  const set = [
    marker(),
    marker({
      kind: "window",
      label: "北墙窗户",
      anchor: "wall",
      size: [1.4, 1.2, 0.1],
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.18 },
    }),
    marker({
      kind: "bed",
      label: "床",
      anchor: "floor",
      size: [2, 0.775, 2],
      imageRegion: { x: 0.35, y: 0.32, width: 0.14, height: 0.2 },
    }),
  ];
  const first = projectStoryScene3dMarkerSetFromImageRegions(set, environment, {
    maxRadius: FALLBACK_RADIUS,
  });
  const second = projectStoryScene3dMarkerSetFromImageRegions(
    set.map((entry, index) => ({
      ...entry,
      position: first[index].position,
      size: first[index].size,
      yawDeg: first[index].yawDeg,
    })),
    environment,
    { maxRadius: FALLBACK_RADIUS },
  );
  for (const [index, projection] of second.entries()) {
    projection.position.forEach((value, axis) => {
      assert.ok(Math.abs(value - first[index].position[axis]) < 1e-9);
    });
    projection.size.forEach((value, axis) => {
      assert.ok(Math.abs(value - first[index].size[axis]) < 1e-9);
    });
    assert.equal(projection.yawDeg, first[index].yawDeg);
  }
});
