import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "src/components/image/ImageGenerationConfirmDialog.tsx"),
  "utf8",
);

test("漫剧角色与分镜确认弹窗只允许 16:9 画幅", () => {
  assert.match(source, /1536x864.*横版 16:9/);
  assert.match(source, /const fixedImageSize = preview\?\.kind\.startsWith\("comic\.scene:"\)/);
  assert.match(source, /const fixedImageProvider = preview\?\.kind\.startsWith\("comic\.scene:"\) \? "codex"/);
  assert.match(source, /preview\?\.kind\.startsWith\("drama\."\)/);
  assert.match(source, /option\.value === fixedImageSize/);
  assert.doesNotMatch(source, /fixedImageSize[\s\S]{0,500}1536x1024.*baseOptions/);
});

test("正式角色资产和场景全景确认弹窗使用各自固定画幅", () => {
  assert.match(source, /1536x864.*横版 16:9/);
  assert.match(source, /2048x1024.*全景 2:1/);
  assert.match(source, /comic\.scene:/);
  assert.match(source, /comic\.character(?:\.sheet|\.expression)|comic\.character-asset:/);
});
