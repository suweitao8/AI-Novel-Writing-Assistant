/**
 * 透明底确定性抠底（2026-08-23）：codex 图片通道的 edits（带参考图）路径实测会把
 * 透明底压平成不透明纯色底（CLI 的图片工具没有 background 参数，提示词里的透明
 * 指令在 edits 上不生效；纯生成路径有效）。所有图片生成统一过 runner 落盘，这里
 * 在「请求了透明底但结果没有 alpha 通道」时，把与边缘连通的背景色恢复成透明：
 *
 * 1. 采样四边像素取主色（占比过半才认为是纯色背景，风景/场景底不碰）；
 * 2. 从边缘洪水填充：与背景色欧氏距离在容差内的连通像素 alpha=0；
 * 3. 安全阀：抠掉比例超过 92% 视为判定异常（如整图纯色），保持原图。
 *
 * 纯确定性像素处理（sharp + 原始像素遍历），不引入新依赖，不调用模型。
 */
import sharp from "sharp";

/** 与背景色的欧氏距离容差（抗轻微噪点/渐变；主体现有颜色不会被抠掉）。 */
const KEY_TOLERANCE = 30;
/** 边缘主色最低占比：低于一半说明背景不是纯色（如真实场景），不抠。 */
const MIN_BORDER_COVERAGE = 0.5;
/** 抠掉像素占比上限：超过视为判定异常，放弃保持原图。 */
const MAX_KEYED_RATIO = 0.92;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 采样四边像素，返回主色与占比；无法判定（无主色过半）返回 null。 */
function detectBorderKeyColor(data: Buffer, width: number, height: number, channels: number): Rgb | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 4bit/通道量化分桶，容忍背景本身的轻微噪点。
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  };
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  let total = 0;
  let dominant: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    total += bucket.count;
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket;
    }
  }
  if (!dominant || total === 0 || dominant.count / total < MIN_BORDER_COVERAGE) {
    return null;
  }
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count),
  };
}

/**
 * 请求透明底的结果若没有 alpha 通道，恢复透明背景；已有 alpha 或无法安全判定时
 * 原样返回。输出恒为 PNG。
 */
export async function ensureTransparentBackground(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  if (meta.hasAlpha || !meta.width || !meta.height) {
    return buffer;
  }
  const { data, info } = await sharp(buffer, { failOn: "none" }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const key = detectBorderKeyColor(data, width, height, channels);
  if (!key) {
    return buffer;
  }

  const total = width * height;
  const keyed = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const withinTolerance = (index: number): boolean => {
    const i = index * channels;
    return colorDistance({ r: data[i], g: data[i + 1], b: data[i + 2] }, key) <= KEY_TOLERANCE;
  };
  const enqueue = (index: number) => {
    if (keyed[index]) return;
    if (!withinTolerance(index)) return;
    keyed[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  let keyedCount = 0;
  while (head < tail) {
    const index = queue[head++];
    keyedCount += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }
  if (keyedCount === 0 || keyedCount > total * MAX_KEYED_RATIO) {
    return buffer;
  }

  const out = Buffer.alloc(total * 4);
  for (let index = 0; index < total; index += 1) {
    const i = index * channels;
    const o = index * 4;
    out[o] = data[i];
    out[o + 1] = data[i + 1];
    out[o + 2] = data[i + 2];
    out[o + 3] = keyed[index] ? 0 : 255;
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
