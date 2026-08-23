import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/image/ImageGenerationConfirmDialog.tsx", import.meta.url), "utf8");

test("确认过的摆位草图在生图确认窗中作为锁定参考，不能被移除", () => {
  assert.match(source, /layout_sketch: "摆位草图"/);
  assert.match(source, /const isLockedReference = ref\.kind === "layout_sketch"/);
  assert.match(source, /!isLockedReference \? \(/);
});
