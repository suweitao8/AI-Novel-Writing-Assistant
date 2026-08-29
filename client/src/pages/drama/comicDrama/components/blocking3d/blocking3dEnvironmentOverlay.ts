import * as pc from "playcanvas";

import { resolveStoryScene3DDomeWorldRadius } from "@ai-novel/shared/utils/blockingStage";

import { GROUND_DOME_FLAT_RADIUS } from "./blocking3dEnvironmentGeometry.ts";
import type { Blocking3dEnvironmentSettings } from "./blocking3dViewerCore.ts";

const GROUND_GRID_SPACING_METERS = 1;
const GROUND_GRID_Y = 0.005;

export interface Blocking3dGroundGridLine {
  start: pc.Vec3;
  end: pc.Vec3;
  color: pc.Color;
}

function createGridColor(major: boolean): pc.Color {
  return new pc.Color(
    major ? 0.46 : 0.28,
    major ? 0.5 : 0.32,
    major ? 0.58 : 0.4,
    major ? 0.62 : 0.38,
  );
}

/**
 * 构建漫剧 3D 环境同款地面辅助网格。
 *
 * domeRadius 的产品语义是完整直径，因此网格先换算成世界半径，再收进
 * 地面平底半径。这样模型、动画和漫剧查看器不会各自使用固定的 3m/10m
 * 范围，也不会把线画到半圆地面的弧形过渡区之外。
 */
export function buildBlocking3dGroundGridLines(
  environmentSettings: Blocking3dEnvironmentSettings,
): Blocking3dGroundGridLine[] {
  const floorRadius = Math.max(
    GROUND_GRID_SPACING_METERS,
    resolveStoryScene3DDomeWorldRadius(environmentSettings) * GROUND_DOME_FLAT_RADIUS,
  );
  const lastGridValue = Math.floor(floorRadius / GROUND_GRID_SPACING_METERS) * GROUND_GRID_SPACING_METERS;
  const lines: Blocking3dGroundGridLine[] = [];

  for (
    let value = -lastGridValue;
    value <= lastGridValue + Number.EPSILON;
    value += GROUND_GRID_SPACING_METERS
  ) {
    const major = Math.abs(value % 5) < Number.EPSILON;
    const color = createGridColor(major);
    lines.push({
      start: new pc.Vec3(value, GROUND_GRID_Y, -floorRadius),
      end: new pc.Vec3(value, GROUND_GRID_Y, floorRadius),
      color,
    });
    lines.push({
      start: new pc.Vec3(-floorRadius, GROUND_GRID_Y, value),
      end: new pc.Vec3(floorRadius, GROUND_GRID_Y, value),
      color: createGridColor(major),
    });
  }

  return lines;
}

export function drawBlocking3dGroundGrid(
  app: pc.AppBase,
  lines: readonly Blocking3dGroundGridLine[],
): void {
  for (const line of lines) app.drawLine(line.start, line.end, line.color, false);
}
