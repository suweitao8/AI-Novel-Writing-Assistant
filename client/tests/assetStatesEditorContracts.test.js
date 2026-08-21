import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "src/pages/novels/components/storySettings/assetForms.tsx"),
  "utf8",
);

test("角色、场景、道具共用紧凑的左状态列表右详情布局", () => {
  assert.match(source, /grid items-start gap-3 lg:grid-cols/);
  assert.match(source, /self-start min-w-0 max-h-\[26rem\] overflow-y-auto/);
  assert.match(source, /self-start min-w-0 rounded-lg/);
  assert.match(source, /max-h-64 aspect-\[3\/2\] w-full/);
  assert.match(source, /flex min-h-28 items-center justify-center/);
  assert.doesNotMatch(source, /className="aspect-video w-full object-cover"/);
});

test("状态图地址携带生成时间，重新生成后不会命中旧缓存", () => {
  assert.match(source, /function buildStateImageSrc\(/);
  assert.match(source, /generatedAt/);
  assert.match(source, /buildStateImageSrc\(state\.image\.url, state\.image\.generatedAt\)/);
  assert.match(source, /buildStateImageSrc\(selectedState\.image\.url, selectedState\.image\.generatedAt\)/);
});

test("状态详情图片使用独立的大图预览入口", () => {
  assert.match(source, /import .*LightboxImage.*from "@\/components\/common\/LightboxImage"/);
  assert.match(source, /<LightboxImage/);
  assert.match(source, /fit="contain"/);
});
