const assert = require("node:assert/strict");
const test = require("node:test");

const {
  equirectangularRegionCenterToHorizontalDirection,
  projectStoryScene3dMarkerFromImageRegion,
} = require("../../shared/dist/utils/scene3dProjection.js");

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
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

test("图像区域纠正门窗方向，保留深度半径并让墙面朝向径向方向", () => {
  const projected = projectStoryScene3dMarkerFromImageRegion(
    marker(),
    environment,
    6,
  );
  assert.ok(projected.position[0] > 0);
  assert.ok(projected.position[2] < 0);
  assert.ok(Math.abs(
    Math.hypot(projected.position[0], projected.position[2]) - Math.hypot(3.3, 0.6),
  ) < 1e-9);
  assert.ok(projected.yawDeg > 90);
});

test("地面物体保留自身朝向并按尺寸落地，手工标记和缺失区域保持原坐标", () => {
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
  assert.equal(floor.position[1], 0.38);
  assert.equal(floor.yawDeg, -90);

  const manual = projectStoryScene3dMarkerFromImageRegion(
    marker({ source: "manual", position: [1, 1, 1] }),
    environment,
    6,
  );
  assert.deepEqual(manual.position, [1, 1, 1]);
  assert.equal(manual.yawDeg, -90);

  const withoutRegion = projectStoryScene3dMarkerFromImageRegion(
    marker({ imageRegion: undefined, position: [1, 2, 3] }),
    environment,
    6,
  );
  assert.deepEqual(withoutRegion.position, [1, 2, 3]);
});

test("重复投影是幂等的，不会让 marker 继续漂移", () => {
  const first = projectStoryScene3dMarkerFromImageRegion(marker(), environment, 6);
  const second = projectStoryScene3dMarkerFromImageRegion(
    marker({ position: first.position, yawDeg: first.yawDeg }),
    environment,
    6,
  );
  second.position.forEach((value, index) => {
    assert.ok(Math.abs(value - first.position[index]) < 1e-9);
  });
  assert.equal(second.yawDeg, first.yawDeg);
});
