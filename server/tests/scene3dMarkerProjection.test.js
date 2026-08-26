const assert = require("node:assert/strict");
const test = require("node:test");

const {
  equirectangularRegionCenterToHorizontalDirection,
  projectStoryScene3dMarkerFromImageRegion,
  STORY_SCENE_3D_MARKER_SIZE_POLICIES,
} = require("../../shared/dist/utils/scene3dProjection.js");

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
};

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

test("墙面物体不再采信近中心深度，并落到图片对应的外侧墙面", () => {
  const projected = projectStoryScene3dMarkerFromImageRegion(
    marker({
      kind: "window",
      label: "北墙窗户",
      position: [0, 1.2, 0],
      size: [1, 1, 0.1],
      imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.18 },
    }),
    environment,
    6,
  );
  assert.ok(projected.position[0] > 0);
  assert.ok(projected.position[2] < 0);
  assert.ok(Math.abs(
    Math.hypot(projected.position[0], projected.position[2]) - Math.hypot(3.3, 0.6),
  ) > 1, "墙面标记不能继续停留在模型给出的近中心半径");
  assert.ok(Math.abs(Math.hypot(projected.position[0], projected.position[2]) - 6) < 1e-9);
  assert.ok(projected.yawDeg > 90);
  assert.ok(projected.size[0] > 1, "窗户宽度应参考图片区域校准");
  assert.ok(projected.size[1] > 1, "窗户高度应参考图片区域校准");
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
});

test("重复投影是幂等的，不会让 marker 继续漂移或反复改变尺寸", () => {
  const first = projectStoryScene3dMarkerFromImageRegion(marker(), environment, 6);
  const second = projectStoryScene3dMarkerFromImageRegion(
    marker({ position: first.position, size: first.size, yawDeg: first.yawDeg }),
    environment,
    6,
  );
  second.position.forEach((value, index) => {
    assert.ok(Math.abs(value - first.position[index]) < 1e-9);
  });
  second.size.forEach((value, index) => {
    assert.ok(Math.abs(value - first.size[index]) < 1e-9);
  });
  assert.equal(second.yawDeg, first.yawDeg);
});
