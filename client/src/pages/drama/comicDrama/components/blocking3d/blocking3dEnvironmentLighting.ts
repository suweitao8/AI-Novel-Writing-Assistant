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

export interface HdriTextureSourceReader {
  getSource: (mipLevel?: number) => HTMLImageElement;
}

const HDRI_LIGHT_MIN_INTENSITY = 1;
const HDRI_LIGHT_MAX_INTENSITY = 2.2;
const HDRI_LIGHT_SAMPLE_WIDTH = 96;
const HDRI_LIGHT_SAMPLE_HEIGHT = 48;
const HDRI_LIGHT_LUMINANCE_THRESHOLD = 0.52;

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

/**
 * Estimate the direction and color of the brightest useful part of an
 * equirectangular HDRI. PlayCanvas maps image U to atan(direction.x,
 * direction.z) and image V to 0.5 - asin(direction.y) / PI; the inverse
 * mapping here deliberately follows that contract so the light agrees with
 * the visible HDRI projection.
 */
export function estimateHdriLightFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
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
      const verticalProgress = (y + 0.5) / height;
      const elevation = Math.PI * 0.5 - verticalProgress * Math.PI;
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
 * Read a small same-origin canvas copy of the loaded source image. A remote
 * or otherwise protected image can taint the canvas; in that case the HDRI
 * atlas and backdrop still work and the caller receives a stable fallback.
 */
export function estimateHdriLightFromTexture(texture: HdriTextureSourceReader): HdriLightEstimate {
  if (typeof document === "undefined") return copyDefaultEstimate();

  try {
    const source = texture.getSource();
    if (!source) return copyDefaultEstimate();

    const canvas = document.createElement("canvas");
    canvas.width = HDRI_LIGHT_SAMPLE_WIDTH;
    canvas.height = HDRI_LIGHT_SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return copyDefaultEstimate();

    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return estimateHdriLightFromPixels(pixels, canvas.width, canvas.height);
  } catch {
    return copyDefaultEstimate();
  }
}
