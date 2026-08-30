import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MODEL_LIBRARY } from "../src/config/modelLibrary.ts";
import {
  MODEL_USAGE_INSTRUCTIONS,
  attachModelUsageInstructions,
  getModelUsageAnchorLabel,
  getModelUsageInstruction,
} from "../src/config/modelLibraryUsage.ts";

const modelLibraryPageSource = readFileSync(new URL("../src/pages/models/ModelLibraryPage.tsx", import.meta.url), "utf8");
const modelEditorPageSource = readFileSync(new URL("../src/pages/models/ModelEditorPage.tsx", import.meta.url), "utf8");

const VALID_SUPPORT_SURFACES = new Set([
  "ground",
  "wall",
  "ceiling",
  "horizontal-surface",
  "handheld",
  "free",
]);
const VALID_PLACEMENT_MODES = new Set([
  "grounded",
  "wall-mounted",
  "ceiling-hung",
  "surface-placed",
  "handheld",
  "free",
]);
const VALID_ANCHORS = new Set(["base", "back", "top", "support-center", "center"]);
const VALID_ORIENTATIONS = new Set([
  "upright",
  "horizontal",
  "wall-facing",
  "downward",
  "directional",
  "free",
]);

test("每个模型都有完整的结构化使用说明", () => {
  assert.equal(MODEL_LIBRARY.length, 79);
  assert.equal(Object.keys(MODEL_USAGE_INSTRUCTIONS).length, MODEL_LIBRARY.length);

  for (const entry of MODEL_LIBRARY) {
    assert.ok(entry.usage, `${entry.id} 缺少 usage`);
    assert.equal(entry.usage, MODEL_USAGE_INSTRUCTIONS[entry.id], `${entry.id} 没有绑定目录说明`);
    assert.ok(VALID_SUPPORT_SURFACES.has(entry.usage.supportSurface), `${entry.id} 支撑面非法`);
    assert.ok(VALID_PLACEMENT_MODES.has(entry.usage.placementMode), `${entry.id} 摆放方式非法`);
    assert.ok(VALID_ANCHORS.has(entry.usage.anchor), `${entry.id} 定位基准非法`);
    assert.ok(VALID_ORIENTATIONS.has(entry.usage.orientation), `${entry.id} 朝向非法`);
    assert.equal(typeof entry.usage.requiresFacingDirection, "boolean", `${entry.id} 方向标记非法`);
    assert.equal(typeof entry.usage.instruction, "string", `${entry.id} 说明必须是文字`);
    assert.ok(entry.usage.instruction.trim().length > 0, `${entry.id} 说明不能为空`);
  }
});

test("代表性模型的使用说明符合实际安装方式", () => {
  const clock = getModelUsageInstruction("clock-01a");
  assert.deepEqual(
    {
      supportSurface: clock?.supportSurface,
      placementMode: clock?.placementMode,
      anchor: clock?.anchor,
      orientation: clock?.orientation,
      requiresFacingDirection: clock?.requiresFacingDirection,
    },
    {
      supportSurface: "wall",
      placementMode: "wall-mounted",
      anchor: "back",
      orientation: "wall-facing",
      requiresFacingDirection: true,
    },
  );

  const lamp = getModelUsageInstruction("chinese-lamp-01a");
  assert.deepEqual(
    {
      supportSurface: lamp?.supportSurface,
      placementMode: lamp?.placementMode,
      anchor: lamp?.anchor,
      orientation: lamp?.orientation,
      requiresFacingDirection: lamp?.requiresFacingDirection,
    },
    {
      supportSurface: "ceiling",
      placementMode: "ceiling-hung",
      anchor: "top",
      orientation: "downward",
      requiresFacingDirection: true,
    },
  );

  const basket = getModelUsageInstruction("garbagebasket01");
  assert.deepEqual(
    {
      supportSurface: basket?.supportSurface,
      placementMode: basket?.placementMode,
      anchor: basket?.anchor,
      orientation: basket?.orientation,
      requiresFacingDirection: basket?.requiresFacingDirection,
    },
    {
      supportSurface: "ground",
      placementMode: "grounded",
      anchor: "base",
      orientation: "upright",
      requiresFacingDirection: false,
    },
  );
});

test("使用说明读取入口对未知模型安全返回 null", () => {
  assert.equal(getModelUsageInstruction(undefined), null);
  assert.equal(getModelUsageInstruction("missing-model"), null);
  assert.equal(getModelUsageAnchorLabel("back"), "背面");
  assert.equal(getModelUsageAnchorLabel("top"), "顶部吊点");
});

test("模型卡片和详情页都从结构化 usage 读取说明", () => {
  assert.match(modelLibraryPageSource, /entry\.usage\.supportSurface/);
  assert.match(modelLibraryPageSource, /entry\.usage\.placementMode/);
  assert.match(modelLibraryPageSource, /data-model-usage-summary/);
  assert.match(modelEditorPageSource, /data-model-usage/);
  assert.match(modelEditorPageSource, /entry\.usage\.anchor/);
  assert.match(modelEditorPageSource, /entry\.usage\.requiresFacingDirection/);
  assert.match(modelEditorPageSource, /entry\.usage\.instruction/);
  assert.match(modelEditorPageSource, /title="使用说明"/);
});

test("说明装配会拒绝漏配和孤立说明", () => {
  const instruction = MODEL_USAGE_INSTRUCTIONS["garbagebasket01"];
  assert.throws(
    () => attachModelUsageInstructions([{ id: "new-model" }]),
    /missing model usage instructions: new-model/,
  );
  assert.throws(
    () => attachModelUsageInstructions([{ id: "garbagebasket01" }]),
    /orphan model usage instructions: /,
  );
  assert.ok(instruction);
});
