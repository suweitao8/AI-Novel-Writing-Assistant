const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const { ensureTransparentBackground } = require("../dist/services/image/backgroundKeying.js");

const runnerSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "image", "runtime", "runner.ts"),
  "utf8",
);
const utilsSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "image", "runtime", "utils.ts"),
  "utf8",
);

/** 白底 + 中央红色矩形的不透明 PNG（模拟 edits 路径被压平的角色图）。 */
async function whiteBgWithRedRect(width = 200, height = 150, noise = false) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const base = noise ? 246 + Math.floor(Math.random() * 9) : 255;
    raw[i * 3] = base;
    raw[i * 3 + 1] = base;
    raw[i * 3 + 2] = base;
  }
  for (let y = 40; y < 110; y += 1) {
    for (let x = 50; x < 150; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = 200;
      raw[i + 1] = 30;
      raw[i + 2] = 40;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** 全图横向彩虹渐变（模拟真实场景底色，边缘无主色）。 */
async function gradientBg(width = 200, height = 150) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round((x / width) * 255);
      raw[i + 1] = Math.round(((x + y) / (width + height)) * 255);
      raw[i + 2] = Math.round(255 - (x / width) * 255);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

test("纯白底被洪水填充抠成透明，主体保留（edits 压平修复的核心场景）", async () => {
  const keyed = await ensureTransparentBackground(await whiteBgWithRedRect());
  const meta = await sharp(keyed).metadata();
  assert.equal(meta.format, "png");
  assert.ok(meta.hasAlpha, "抠底后必须有 alpha 通道");
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alphaAt(2, 2), 0, "角落背景必须透明");
  assert.equal(alphaAt(info.width - 3, info.height - 3), 0, "对角背景必须透明");
  assert.equal(alphaAt(100, 75), 255, "红色主体必须保持不透明");
});

test("带轻微噪点的近白底同样能抠（真实生成图的背景不是完美 255）", async () => {
  const keyed = await ensureTransparentBackground(await whiteBgWithRedRect(200, 150, true));
  const meta = await sharp(keyed).metadata();
  assert.ok(meta.hasAlpha, "噪点白底也要恢复透明");
});

test("已有 alpha 通道的图原样返回，不做二次处理", async () => {
  const raw = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 128,
    0, 0, 255, 255, 255, 255, 0, 0,
  ]);
  const rgba = await sharp(raw, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  const result = await ensureTransparentBackground(rgba);
  assert.ok(result.equals(rgba), "已透明输入必须逐字节原样返回");
});

test("边缘无主色（真实场景底）不抠，保持原图", async () => {
  const gradient = await gradientBg();
  const result = await ensureTransparentBackground(gradient);
  assert.ok(result.equals(gradient), "风景/渐变底必须原样返回");
});

test("整图纯色触发安全阀，原样返回（不能抠成空图）", async () => {
  const allWhite = await sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  const result = await ensureTransparentBackground(allWhite);
  assert.ok(result.equals(allWhite), "全白图必须原样返回");
});

test("runner 落盘前接线透明底抠底；saveImageToDisk 复用同一字节出口", () => {
  // 修复的接线点：请求 background=transparent 且 outputFormat=png 时过 ensureTransparentBackground。
  assert.match(runnerSource, /ensureTransparentBackground\(rawBytes\)/);
  assert.match(runnerSource, /opts\.background === "transparent" && opts\.outputFormat === "png"/);
  assert.match(runnerSource, /resolveImageBytes\(imageUrl\)/);
  // 旧直接保存路径统一改走字节出口，其他调用方（saveImageToDisk）不受影响。
  assert.match(utilsSource, /saveImageToDisk[\s\S]*writeImageBytes\(destPath, await resolveImageBytes\(imageUrl\)\)/);
});
