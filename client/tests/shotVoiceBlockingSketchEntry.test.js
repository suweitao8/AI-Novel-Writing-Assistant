import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/drama/comicDrama/ShotVoiceListPanel.tsx", import.meta.url), "utf8");

test("每一镜的画面区域都有摆位入口，并在保存后刷新当前项目", () => {
  assert.doesNotMatch(source, /ShotBlockingSketchDialog/);
  assert.match(source, /3D 草图/);
  assert.doesNotMatch(source, /2D 草图/);
  assert.match(source, /encodeURIComponent\(props\.projectId\)/);
});
