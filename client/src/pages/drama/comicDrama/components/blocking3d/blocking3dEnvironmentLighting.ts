export interface HdriLightEstimate {
  /** Direction from the lit surface toward the brightest useful HDRI region. */
  direction: [number, number, number];
  /** Representative sRGB color of the sampled bright region. */
  color: [number, number, number];
  /** Bounded PlayCanvas directional-light intensity. */
  intensity: number;
  /** True when the image did not contain a readable directional signal. */
  usedFallback: boolean;
}

export type HdriPixelEncoding = "srgb" | "rgbe";

export interface HdriTextureSourceReader {
  getSource: (mipLevel?: number) => unknown;
  width?: number;
  height?: number;
  type?: string;
}

const HDRI_LIGHT_MIN_INTENSITY = 1;
const HDRI_LIGHT_MAX_INTENSITY = 2.2;
const HDRI_LIGHT_SAMPLE_WIDTH = 96;
const HDRI_LIGHT_SAMPLE_HEIGHT = 48;
const HDRI_LIGHT_LUMINANCE_THRESHOLD = 0.52;
const HDRI_LIGHT_RELATIVE_LUMINANCE_THRESHOLD = 0.9;
const HDRI_LIGHT_MIN_PEAK_TO_MEAN_RATIO = 1.12;

export const DEFAULT_HDRI_LIGHT_ESTIMATE: HdriLightEstimate = {
  direction: [0.45, 0.72, 0.5],
  color: [1, 0.95, 0.88],
  intensity: 1,
  usedFallback: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function copyDefaultEstimate(): HdriLightEstimate {
  return {
    direction: [...DEFAULT_HDRI_LIGHT_ESTIMATE.direction] as [number, number, number],
    color: [...DEFAULT_HDRI_LIGHT_ESTIMATE.color] as [number, number, number],
    intensity: DEFAULT_HDRI_LIGHT_ESTIMATE.intensity,
    usedFallback: true,
  };
}

function normalizeDirection(x: number, y: number, z: number): [number, number, number] | null {
  const length = Math.hypot(x, y, z);
  if (length < 0.0001) return null;
  return [x / length, y / length, z / length];
}

type HdriBytePixels = Uint8Array | Uint8ClampedArray;

function asBytePixels(source: unknown): HdriBytePixels | null {
  if (source instanceof Uint8Array || source instanceof Uint8ClampedArray) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return null;
}

function isRgbETexture(texture: HdriTextureSourceReader): boolean {
  return typeof texture.type === "string" && texture.type.toLowerCase() === "rgbe";
}

function toneMapHdrChannel(value: number): number {
  return value / (1 + value);
}

function resolvePanoramaHorizonV(value: number | undefined): number {
  return Number.isFinite(value) ? clamp(value as number, 0, 1) : 0.5;
}

function equirectangularElevation(y: number, height: number, panoramaHorizonV: number): number {
  const verticalProgress = (y + 0.5) / height;
  return (panoramaHorizonV - verticalProgress) * Math.PI;
}

/** Estimate an equirectangular light from an sRGB-like pixel buffer. */
function estimateHdriLightFromSrgbPixels(
  pixels: HdriBytePixels,
  width: number,
  height: number,
  panoramaHorizonV: number,
): HdriLightEstimate {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return copyDefaultEstimate();

  const upperHeight = Math.max(1, Math.floor(height * 0.72));
  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / 96));
  let sampledPixels = 0;
  let totalWeight = 0;
  let directionX = 0;
  let directionY = 0;
  let directionZ = 0;
  let colorR = 0;
  let colorG = 0;
  let colorB = 0;
  let weightedLuminance = 0;
  let peakBrightness = 0;

  for (let y = 0; y < upperHeight; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      sampledPixels += 1;
      const offset = (y * width + x) * 4;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const alpha = pixels[offset + 3] / 255;
      if (alpha <= 0) continue;

      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const brightness = Math.max(luminance - HDRI_LIGHT_LUMINANCE_THRESHOLD, 0);
      if (brightness <= 0) continue;

      // Equirectangular pixels near the poles cover less solid angle. Keep a
      // small floor so a high window/sky light is still usable, while not
      // letting a single pole pixel dominate the estimate.
      const elevation = equirectangularElevation(y, height, panoramaHorizonV);
      const solidAngleWeight = Math.max(Math.cos(elevation), 0.2);
      const upperImageWeight = 1 - (y / Math.max(upperHeight, 1)) * 0.35;
      const weight = alpha * brightness * brightness * solidAngleWeight * upperImageWeight;
      if (weight <= 0) continue;

      const horizontalProgress = (x + 0.5) / width;
      const azimuth = (horizontalProgress - 0.5) * Math.PI * 2;
      const horizontalLength = Math.cos(elevation);
      const sampleDirectionX = Math.sin(azimuth) * horizontalLength;
      const sampleDirectionY = Math.sin(elevation);
      const sampleDirectionZ = Math.cos(azimuth) * horizontalLength;

      totalWeight += weight;
      directionX += sampleDirectionX * weight;
      directionY += sampleDirectionY * weight;
      directionZ += sampleDirectionZ * weight;
      colorR += red * weight;
      colorG += green * weight;
      colorB += blue * weight;
      weightedLuminance += luminance * weight;
      peakBrightness = Math.max(peakBrightness, brightness);
    }
  }

  if (totalWeight <= 0 || sampledPixels <= 0) return copyDefaultEstimate();
  const direction = normalizeDirection(directionX, directionY, directionZ);
  if (!direction) return copyDefaultEstimate();

  const averageLuminance = weightedLuminance / totalWeight;
  const highlightCoverage = clamp(totalWeight / sampledPixels, 0, 1);
  const intensity = clamp(
    HDRI_LIGHT_MIN_INTENSITY
      + Math.max(0, averageLuminance - HDRI_LIGHT_LUMINANCE_THRESHOLD) * 2.4
      + Math.min(highlightCoverage, 0.18) * 1.4
      + peakBrightness * 0.12,
    HDRI_LIGHT_MIN_INTENSITY,
    HDRI_LIGHT_MAX_INTENSITY,
  );

  return {
    direction,
    color: [
      clamp(colorR / totalWeight, 0.72, 1),
      clamp(colorG / totalWeight, 0.72, 1),
      clamp(colorB / totalWeight, 0.72, 1),
    ],
    intensity,
    usedFallback: false,
  };
}

/**
 * PlayCanvas stores a loaded .hdr texture as four-byte RGBE texels rather
 * than an HTML image. Pick the brightest texel in each sampling block so a
 * narrow sun or window is not lost when a large panorama is reduced to the
 * estimator's working resolution.
 */
function estimateHdriLightFromRgbEPixels(
  pixels: HdriBytePixels,
  width: number,
  height: number,
  panoramaHorizonV: number,
): HdriLightEstimate {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return copyDefaultEstimate();

  const upperHeight = Math.max(1, Math.floor(height * 0.72));
  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / HDRI_LIGHT_SAMPLE_WIDTH));
  const samples: Array<{
    x: number;
    y: number;
    linearRed: number;
    linearGreen: number;
    linearBlue: number;
    linearLuminance: number;
  }> = [];
  let sampledPixels = 0;
  let peakLinearLuminance = 0;

  for (let blockY = 0; blockY < upperHeight; blockY += sampleStep) {
    for (let blockX = 0; blockX < width; blockX += sampleStep) {
      let bestX = blockX;
      let bestY = blockY;
      let bestLinearRed = 0;
      let bestLinearGreen = 0;
      let bestLinearBlue = 0;
      let bestLinearLuminance = 0;

      for (let y = blockY; y < Math.min(blockY + sampleStep, upperHeight); y += 1) {
        for (let x = blockX; x < Math.min(blockX + sampleStep, width); x += 1) {
          const offset = (y * width + x) * 4;
          const exponent = pixels[offset + 3];
          if (exponent === 0) continue;

          // Match PlayCanvas' decodeRGBE shader: texture channels are
          // normalized by the GPU to 0..1 before the shared exponent is
          // applied.
          const scale = 2 ** (exponent - 128) / 255;
          const linearRed = pixels[offset] * scale;
          const linearGreen = pixels[offset + 1] * scale;
          const linearBlue = pixels[offset + 2] * scale;
          const linearLuminance = 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
          if (linearLuminance <= bestLinearLuminance) continue;

          bestX = x;
          bestY = y;
          bestLinearRed = linearRed;
          bestLinearGreen = linearGreen;
          bestLinearBlue = linearBlue;
          bestLinearLuminance = linearLuminance;
        }
      }

      sampledPixels += 1;
      if (bestLinearLuminance <= 0) continue;

      samples.push({
        x: bestX,
        y: bestY,
        linearRed: bestLinearRed,
        linearGreen: bestLinearGreen,
        linearBlue: bestLinearBlue,
        linearLuminance: bestLinearLuminance,
      });
      peakLinearLuminance = Math.max(peakLinearLuminance, bestLinearLuminance);
    }
  }

  if (samples.length <= 0 || sampledPixels <= 0 || peakLinearLuminance <= 0) {
    return copyDefaultEstimate();
  }

  // RGBE files often arrive pre-exposed/normalized: the brightest texel can
  // decode to a linear luminance of only 1. A fixed post-tone-map threshold
  // therefore loses the sun completely. First require an actual peak over the
  // panorama average, then score each block relative to that peak so exposure
  // does not change the inferred direction.
  const meanLinearLuminance = samples.reduce(
    (total, sample) => total + sample.linearLuminance,
    0,
  ) / samples.length;
  if (
    meanLinearLuminance <= 0
    || peakLinearLuminance / meanLinearLuminance < HDRI_LIGHT_MIN_PEAK_TO_MEAN_RATIO
  ) {
    return copyDefaultEstimate();
  }

  let totalWeight = 0;
  let directionX = 0;
  let directionY = 0;
  let directionZ = 0;
  let colorR = 0;
  let colorG = 0;
  let colorB = 0;
  let weightedLuminance = 0;
  let peakBrightness = 0;

  for (const sample of samples) {
    const relativeBrightness = Math.max(
      sample.linearLuminance / peakLinearLuminance - HDRI_LIGHT_RELATIVE_LUMINANCE_THRESHOLD,
      0,
    );
    if (relativeBrightness <= 0) continue;

    const red = toneMapHdrChannel(sample.linearRed);
    const green = toneMapHdrChannel(sample.linearGreen);
    const blue = toneMapHdrChannel(sample.linearBlue);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    // Equirectangular pixels near the poles cover less solid angle. Keep a
    // small floor so a high window/sky light is still usable, while not
    // letting a single pole pixel dominate the estimate.
    const elevation = equirectangularElevation(sample.y, height, panoramaHorizonV);
    const solidAngleWeight = Math.max(Math.cos(elevation), 0.2);
    const upperImageWeight = 1 - (sample.y / Math.max(upperHeight, 1)) * 0.35;
    const weight = relativeBrightness * relativeBrightness * solidAngleWeight * upperImageWeight;
    if (weight <= 0) continue;

    const horizontalProgress = (sample.x + 0.5) / width;
    const azimuth = (horizontalProgress - 0.5) * Math.PI * 2;
    const horizontalLength = Math.cos(elevation);
    const sampleDirectionX = Math.sin(azimuth) * horizontalLength;
    const sampleDirectionY = Math.sin(elevation);
    const sampleDirectionZ = Math.cos(azimuth) * horizontalLength;

    totalWeight += weight;
    directionX += sampleDirectionX * weight;
    directionY += sampleDirectionY * weight;
    directionZ += sampleDirectionZ * weight;
    colorR += red * weight;
    colorG += green * weight;
    colorB += blue * weight;
    weightedLuminance += luminance * weight;
    peakBrightness = Math.max(peakBrightness, relativeBrightness);
  }

  if (totalWeight <= 0 || sampledPixels <= 0) return copyDefaultEstimate();
  const direction = normalizeDirection(directionX, directionY, directionZ);
  if (!direction) return copyDefaultEstimate();

  const averageLuminance = weightedLuminance / totalWeight;
  const highlightCoverage = clamp(totalWeight / sampledPixels, 0, 1);
  const intensity = clamp(
    HDRI_LIGHT_MIN_INTENSITY
      + Math.max(0, averageLuminance - HDRI_LIGHT_LUMINANCE_THRESHOLD) * 2.4
      + Math.min(highlightCoverage, 0.18) * 1.4
      + peakBrightness * 0.12,
    HDRI_LIGHT_MIN_INTENSITY,
    HDRI_LIGHT_MAX_INTENSITY,
  );

  return {
    direction,
    color: [
      clamp(colorR / totalWeight, 0.72, 1),
      clamp(colorG / totalWeight, 0.72, 1),
      clamp(colorB / totalWeight, 0.72, 1),
    ],
    intensity,
    usedFallback: false,
  };
}

export function estimateHdriLightFromPixels(
  pixels: HdriBytePixels,
  width: number,
  height: number,
  encoding: HdriPixelEncoding = "srgb",
  panoramaHorizonV = 0.5,
): HdriLightEstimate {
  const resolvedPanoramaHorizonV = resolvePanoramaHorizonV(panoramaHorizonV);
  return encoding === "rgbe"
    ? estimateHdriLightFromRgbEPixels(pixels, width, height, resolvedPanoramaHorizonV)
    : estimateHdriLightFromSrgbPixels(pixels, width, height, resolvedPanoramaHorizonV);
}

/**
 * Estimate the direction and color of the brightest useful part of an
 * equirectangular HDRI. PlayCanvas maps image U to atan(direction.x,
 * direction.z) and image V to 0.5 - asin(direction.y) / PI; the inverse
 * mapping here deliberately follows that contract so the light agrees with
 * the visible HDRI projection. For PlayCanvas .hdr assets, the estimator
 * reads the RGBE source directly before trying the ordinary image path.
 */
export function estimateHdriLightFromTexture(
  texture: HdriTextureSourceReader,
  panoramaHorizonV = 0.5,
): HdriLightEstimate {
  try {
    const source = texture.getSource();
    if (!source) return copyDefaultEstimate();

    const bytePixels = asBytePixels(source);
    const width = Number(texture.width);
    const height = Number(texture.height);
    if (
      isRgbETexture(texture)
      && bytePixels
      && Number.isInteger(width)
      && Number.isInteger(height)
      && width > 0
      && height > 0
    ) {
      return estimateHdriLightFromPixels(bytePixels, width, height, "rgbe", panoramaHorizonV);
    }

    // Ordinary image sources are read through a small same-origin canvas
    // copy. A remote or protected source may taint the canvas; the HDRI atlas
    // and backdrop still work because this path only derives the key light.
    if (typeof document === "undefined") return copyDefaultEstimate();

    const canvas = document.createElement("canvas");
    canvas.width = HDRI_LIGHT_SAMPLE_WIDTH;
    canvas.height = HDRI_LIGHT_SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return copyDefaultEstimate();

    context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return estimateHdriLightFromPixels(pixels, canvas.width, canvas.height, "srgb", panoramaHorizonV);
  } catch {
    return copyDefaultEstimate();
  }
}
