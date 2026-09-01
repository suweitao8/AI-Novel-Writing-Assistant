/**
 * 角色状态图（1536x1024 双列四视图板）的正面头部自适应取景。
 *
 * 生成图板的视图边界和分隔线位置每次都会漂移，固定坐标窗口会把侧面视图、
 * 邻格内容甚至视图之间的白色分隔线裁进头像。这里在浏览器端对图板做一次
 * 逐列 alpha 分析，找到左上角正面视图的左右边界，再以头部宽度推导方形
 * 取景窗口：
 * 1. 白色分隔线（整列高占比近白像素）→ 取分隔线左侧；
 * 2. 列均亮度陡变（如白衫直切深色侧发）→ 取陡变处左侧；
 * 3. 平滑密度波谷（视图间稀疏过渡）→ 取波谷右侧；
 * 4. 都不存在时回退到旧的固定窗口比例。
 *
 * 结果按 URL 缓存，同一张图只分析一次。
 */

export interface CharacterFaceWindow {
  /** 相对源图的方形窗口左上角与边长（源图像素）。 */
  left: number;
  top: number;
  size: number;
  /** 源图自然宽度，用于换算 CSS 百分比。 */
  naturalWidth: number;
}

const ANALYSIS_WIDTH = 1536;
const MIN_WINDOW = 220;
/** 与旧固定窗口一致的重心比例（y0 = 0.2857 × 边长，头顶留少量裁切）。 */
const TOP_ANCHOR_RATIO = 0.2857;

const cache = new Map<string, CharacterFaceWindow | null>();
const pending = new Map<string, Promise<CharacterFaceWindow | null>>();

export function getCharacterFaceWindow(url: string): Promise<CharacterFaceWindow | null> {
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = pending.get(url);
  if (inflight) return inflight;
  const promise = new Promise<CharacterFaceWindow | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      let result: CharacterFaceWindow | null = null;
      try {
        result = measureFaceWindow(image);
      } catch {
        result = null;
      }
      remember(url, result);
      resolve(result);
    };
    image.onerror = () => {
      remember(url, null);
      resolve(null);
    };
    image.src = url;
  });
  pending.set(url, promise);
  return promise;
}

function remember(url: string, result: CharacterFaceWindow | null): void {
  pending.delete(url);
  if (cache.size > 200) cache.clear();
  cache.set(url, result);
}

function measureFaceWindow(image: HTMLImageElement): CharacterFaceWindow | null {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight || naturalWidth < 320 || naturalHeight < 320) return null;

  const scale = Math.min(1, ANALYSIS_WIDTH / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const half = width >> 1;
  const step = 2;
  const rows = Math.floor(height / step);
  if (half < 40 || rows < 40) return null;

  const xs: number[] = [];
  const density: number[] = [];
  const meanLuma: number[] = [];
  const whiteRatio: number[] = [];
  for (let x = 0; x < half; x += step) {
    let opaque = 0;
    let lumaSum = 0;
    let white = 0;
    for (let y = 0; y < height; y += step) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 32) {
        opaque += 1;
        const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        lumaSum += luma;
        if (luma > 225) white += 1;
      }
    }
    xs.push(x);
    density.push(opaque / rows);
    meanLuma.push(opaque ? lumaSum / opaque : 0);
    whiteRatio.push(white / rows);
  }

  let leftIndex = 0;
  while (leftIndex < density.length && density[leftIndex] < 0.5) leftIndex += 1;
  if (leftIndex >= density.length) leftIndex = 0;
  const leftX = xs[leftIndex];
  // 候选切点必须与左边界构成足够宽的方形窗口，否则视为误检并继续向后扫。
  const minCut = leftX - 8 + MIN_WINDOW;

  let cut = -1;
  for (let i = leftIndex; i < xs.length; i += 1) {
    if (xs[i] > leftX + half * 0.2 && whiteRatio[i] >= 0.55 && xs[i] - 6 >= minCut) {
      cut = xs[i] - 6;
      break;
    }
  }
  if (cut < 0) {
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x = xs[i];
      if (x < half * 0.35 || x + 1 < minCut) continue;
      if (density[i] >= 0.3 && density[i + 1] >= 0.3 && Math.abs(meanLuma[i + 1] - meanLuma[i]) >= 55) {
        cut = x + 1;
        break;
      }
    }
  }
  if (cut < 0) {
    const smooth = density.map((d, i) => {
      const from = Math.max(0, i - 1);
      const slice = density.slice(from, i + 2);
      return slice.reduce((sum, v) => sum + v, 0) / slice.length;
    });
    for (let i = leftIndex; i < smooth.length; i += 1) {
      if (smooth[i] >= 0.45 || xs[i] + 6 < minCut) continue;
      let j = i;
      while (j < smooth.length && smooth[j] < 0.75) j += 1;
      if (j < smooth.length && xs[j] - xs[i] <= 48 && smooth[i] <= Math.min(...smooth.slice(i, j + 1)) + 0.001) {
        cut = xs[i] + 6;
        break;
      }
    }
  }
  if (cut < 0) cut = half;

  let x0 = Math.max(0, leftX - 8);
  let size = cut - x0;
  if (size < MIN_WINDOW) return null;
  if (x0 + size > width) x0 = width - size;

  let top = 0;
  outer: for (let y = 0; y < height; y += 1) {
    for (let x = x0; x < Math.min(x0 + size, half); x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 32) {
        top = y;
        break outer;
      }
    }
  }
  let y0 = top + Math.round(TOP_ANCHOR_RATIO * size);
  y0 = Math.max(0, Math.min(y0, height - size));

  const inverse = naturalWidth / width;
  return {
    left: Math.round(x0 * inverse),
    top: Math.round(y0 * inverse),
    size: Math.round(size * inverse),
    naturalWidth,
  };
}
