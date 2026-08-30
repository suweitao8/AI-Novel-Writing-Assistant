import assert from "node:assert/strict";
import test from "node:test";

import { GROUND_DOME_FLAT_RADIUS } from "./blocking3dEnvironmentGeometry.ts";
import { buildBlocking3dGroundGridLines } from "./blocking3dEnvironmentOverlay.ts";

const DEFAULT_BLOCKING_3D_ENVIRONMENT = {
  projectionCenterHeight: 2,
  projectionCenterHeightRatio: 2 / 15,
  domeRadius: 15,
  panoramaHorizonV: 0.5,
  yawDeg: 0,
  intensity: 1,
};

const normalizeEnvironmentSettings = ({ domeRadius }) => ({
  ...DEFAULT_BLOCKING_3D_ENVIRONMENT,
  domeRadius,
  projectionCenterHeight: Math.round(domeRadius * (2 / 15) * 100) / 100,
});

function maxCoordinate(lines) {
  return Math.max(
    ...lines.flatMap(({ start, end }) => [
      Math.abs(start.x), Math.abs(start.z), Math.abs(end.x), Math.abs(end.z),
    ]),
  );
}

test("默认环境的地面网格以完整直径换算的半径为边界", () => {
  const lines = buildBlocking3dGroundGridLines(DEFAULT_BLOCKING_3D_ENVIRONMENT);
  const expectedExtent = (DEFAULT_BLOCKING_3D_ENVIRONMENT.domeRadius / 2) * GROUND_DOME_FLAT_RADIUS;

  assert.ok(lines.length > 0);
  assert.ok(maxCoordinate(lines) <= expectedExtent + 1e-8);
  assert.equal(lines.some(({ color }) => color.r > 0.4), true, "网格需要保留主网格线");
  assert.equal(lines.every(({ start, end }) => start.y === 0.005 && end.y === 0.005), true);
});

test("半球直径变化时网格边界同步变化而不是固定 3 米或 10 米", () => {
  const small = buildBlocking3dGroundGridLines(normalizeEnvironmentSettings({ domeRadius: 10 }));
  const large = buildBlocking3dGroundGridLines(normalizeEnvironmentSettings({ domeRadius: 30 }));

  assert.ok(maxCoordinate(large) > maxCoordinate(small));
  assert.ok(maxCoordinate(small) <= 5 * GROUND_DOME_FLAT_RADIUS + 1e-8);
  assert.ok(maxCoordinate(large) <= 15 * GROUND_DOME_FLAT_RADIUS + 1e-8);
});
