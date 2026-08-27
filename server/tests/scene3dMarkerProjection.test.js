const assert = require("node:assert/strict");
const test = require("node:test");

const {
  equirectangularRegionCenterToHorizontalDirection,
  projectStoryScene3dMarkerFromImageRegion,
  projectStoryScene3dMarkerSetFromImageRegions,
  STORY_SCENE_3D_MARKER_SIZE_POLICIES,
} = require("../../shared/dist/utils/scene3dProjection.js");

const environment = {
  projectionCenterHeight: 2,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
};

/** 直径字段按产品语义存的是半球直径；几何世界半径 = 直径 / 2。 */
const WORLD_RADIUS = 7.5;

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

/**
 * 与实现同一套球面求交：投影中心在 [0, projectionCenterHeight, 0]，射线沿
 * 区域中心纬度打到半球内表面；back face 完整贴合要求半径内缩厚度的一半。
 */
function expectedSurface(markerInput, entryEnvironment = environment) {
  const horizonV = entryEnvironment.panoramaHorizonV ?? 0.5;
  const centerV = markerInput.imageRegion.y + markerInput.imageRegion.height / 2;
  const latitude = (horizonV - centerV) * Math.PI;
  const projectionCenterHeight = entryEnvironment.projectionCenterHeight ?? 1.7;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.max(0.05, Math.cos(latitude));
  const rayDistance = projectionCenterHeight * sinLatitude
    + Math.sqrt(Math.max(WORLD_RADIUS ** 2 - (projectionCenterHeight * cosLatitude) ** 2, 1));
  return { latitude, rayDistance, surfaceRadius: rayDistance * cosLatitude };
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

test("门窗标记整个长方体完整贴合半球内表面", () => {
  const projectedDoor = projectStoryScene3dMarkerFromImageRegion(
    marker(),
    environment,
  );
  const { surfaceRadius } = expectedSurface(marker());
  const doorThickness = STORY_SCENE_3D_MARKER_SIZE_POLICIES.door.z[0];

  assert.ok(
    Math.abs(horizontalRadius(projectedDoor.position) - (surfaceRadius - doorThickness / 2)) < 0.02,
    "门体长方体外表面必须贴住球面：径向距离 = 球面半径 − 厚度一半",
  );
  assert.equal(projectedDoor.position[1], projectedDoor.size[1] / 2, "门体落地");
  assert.ok(projectedDoor.position[2] < 0, "经度 0.78 位于画面右后侧，方位角随图像保持");
  assert.ok(
    horizontalRadius(projectedDoor.position) + doorThickness / 2 <= WORLD_RADIUS + 1e-6,
    "长方体任何部分都不能穿出半球",
  );

  // 窗户浮空高度来自中心纬度与球面的交点，同样完整贴面。
  const windowMarker = marker({
    kind: "window",
    anchor: "wall",
    size: [1.4, 1.2, 0.1],
    imageRegion: { x: 0.78, y: 0.22, width: 0.08, height: 0.18 },
  });
  const projectedWindow = projectStoryScene3dMarkerFromImageRegion(windowMarker, environment);
  const windowSurface = expectedSurface(windowMarker);
  assert.ok(
    Math.abs(horizontalRadius(projectedWindow.position)
      - (windowSurface.surfaceRadius - STORY_SCENE_3D_MARKER_SIZE_POLICIES.window.z[0] / 2)) < 0.02,
    "窗户长方体同样完整贴住球面",
  );
  const expectedWindowY = environment.projectionCenterHeight
    + Math.sin(windowSurface.latitude) * windowSurface.rayDistance;
  assert.ok(
    Math.abs(projectedWindow.position[1] - expectedWindowY) < 0.02,
    "非落地墙面物体保持图像中心纬度对应的球面高度",
  );
});

test("家具标记也吸附到半球表面且地面锚点保持落地", () => {
  const chairMarker = marker({
    kind: "chair",
    anchor: "floor",
    label: "椅子1",
    position: [9, 0.4, -9],
    size: [0.6, 0.9, 0.6],
    yawDeg: 45,
    imageRegion: { x: 0.5, y: 0.58, width: 0.08, height: 0.14 },
  });
  const projected = projectStoryScene3dMarkerFromImageRegion(chairMarker, environment);
  const chairSurface = expectedSurface(chairMarker);

  assert.equal(projected.position[1], projected.size[1] / 2, "家具保持落地");
  assert.ok(
    Math.abs(horizontalRadius(projected.position)
      - (chairSurface.surfaceRadius - STORY_SCENE_3D_MARKER_SIZE_POLICIES.chair.z[0] / 2)) < 0.02,
    "家具长方体贴在半球内表面正对其可见像素的位置",
  );
  assert.ok(Math.abs(projected.yawDeg) <= 180, "朝向仍为有效的径向角度");
});

test("手工标记与缺少图像区域的标记保留原坐标", () => {
  const manual = marker({ source: "manual" });
  const manualProjected = projectStoryScene3dMarkerFromImageRegion(manual, environment);
  assert.deepEqual(manualProjected.position, manual.position);
  assert.deepEqual(manualProjected.size, manual.size);

  const noRegion = marker({ imageRegion: undefined });
  const untouched = projectStoryScene3dMarkerFromImageRegion(noRegion, environment);
  assert.deepEqual(untouched.position, noRegion.position);
  assert.deepEqual(untouched.size, noRegion.size);
});

test("尺寸校准由图像跨度与类别范围决定，厚度取类别面板深度", () => {
  const wide = marker({ imageRegion: { x: 0.7, y: 0.35, width: 0.24, height: 0.3 } });
  const projectedWide = projectStoryScene3dMarkerFromImageRegion(wide, environment);
  assert.ok(
    projectedWide.size[0] <= STORY_SCENE_3D_MARKER_SIZE_POLICIES.door.x[1] + 1e-9,
    "宽度不能超过类别上限",
  );
  assert.equal(
    projectedWide.size[2],
    STORY_SCENE_3D_MARKER_SIZE_POLICIES.door.z[0],
    "贴面厚度取类别面板下限",
  );

  const tiny = marker({ imageRegion: { x: 0.49, y: 0.45, width: 0.008, height: 0.01 } });
  const projectedTiny = projectStoryScene3dMarkerFromImageRegion(tiny, environment);
  assert.ok(
    projectedTiny.size[0] >= STORY_SCENE_3D_MARKER_SIZE_POLICIES.door.x[0] - 1e-9,
    "过小的框也会抬到类别下限，保证可拾取",
  );
});

test("重复投影保持幂等，环境参数变化立即反映到位置", () => {
  const input = [
    marker(),
    marker({ kind: "window", anchor: "wall", label: "窗", imageRegion: { x: 0.2, y: 0.24, width: 0.07, height: 0.16 } }),
    marker({ kind: "chair", anchor: "floor", label: "椅子1", imageRegion: { x: 0.6, y: 0.6, width: 0.06, height: 0.12 }, position: [4, 0.4, 4], size: [0.5, 0.9, 0.5] }),
  ];
  const first = projectStoryScene3dMarkerSetFromImageRegions(input, environment);
  const second = projectStoryScene3dMarkerSetFromImageRegions(
    input.map((entry, index) => ({ ...entry, ...first[index] })),
    environment,
  );
  for (let index = 0; index < first.length; index += 1) {
    assert.deepEqual(second[index].position, first[index].position, `第 ${index} 个标记幂等`);
    assert.deepEqual(second[index].size, first[index].size);
  }

  const biggerDome = projectStoryScene3dMarkerSetFromImageRegions(input, {
    ...environment,
    domeRadius: 20,
  });
  assert.ok(
    horizontalRadius(biggerDome[0].position) > horizontalRadius(first[0].position),
    "半球直径增大后同方位的贴面半径随之变大",
  );
});

test("落地家具按粗估距离前移并保持前后顺序，门窗保持完全贴面", () => {
  // 同一方位：椅子在书桌前方（书桌更远），粗估距离反映这一关系。
  const chair = marker({
    kind: "chair",
    anchor: "floor",
    label: "椅子1",
    size: [0.6, 0.9, 0.3],
    imageRegion: { x: 0.495, y: 0.55, width: 0.06, height: 0.16 },
    approxDistanceMeters: 2,
  });
  const desk = marker({
    kind: "desk",
    anchor: "floor",
    label: "书桌",
    size: [1.4, 0.9, 0.4],
    imageRegion: { x: 0.495, y: 0.55, width: 0.06, height: 0.16 },
    approxDistanceMeters: 4.5,
  });
  const projectedChair = projectStoryScene3dMarkerFromImageRegion(chair, environment);
  const projectedDesk = projectStoryScene3dMarkerFromImageRegion(desk, environment);

  const chairRadius = horizontalRadius(projectedChair.position);
  const deskRadius = horizontalRadius(projectedDesk.position);
  assert.ok(
    Math.abs(chairRadius - (2 - projectedChair.size[2] / 2)) < 1e-9,
    "椅子按粗估距离前移，盒子仍夹在轴心与球面之间",
  );
  assert.ok(chairRadius < deskRadius, "同方位物体保持真实前后顺序：椅子在书桌前方");

  // 距离超过球面时被钳回贴面半径；墙面标记忽略该字段保持贴面。
  const farChair = marker({
    kind: "chair",
    anchor: "floor",
    label: "远处椅子",
    size: [0.6, 0.9, 0.3],
    imageRegion: { x: 0.495, y: 0.55, width: 0.06, height: 0.16 },
    approxDistanceMeters: 30,
  });
  const doorWithDistance = marker({ approxDistanceMeters: 1 });
  const projectedFar = projectStoryScene3dMarkerFromImageRegion(farChair, environment);
  const projectedDoorWithDistance = projectStoryScene3dMarkerFromImageRegion(doorWithDistance, environment);
  const { surfaceRadius } = expectedSurface(marker());
  const flushDoor = surfaceRadius - STORY_SCENE_3D_MARKER_SIZE_POLICIES.door.z[0] / 2;
  assert.ok(
    horizontalRadius(projectedFar.position) <= flushDoor + 1e-9,
    "粗估距离超出半球时钳回贴面上限",
  );
  assert.ok(
    Math.abs(horizontalRadius(projectedDoorWithDistance.position) - flushDoor) < 0.02,
    "门窗不受粗估距离影响，始终完整贴住球面",
  );
});
