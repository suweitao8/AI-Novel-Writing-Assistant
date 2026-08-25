export interface HdriLightEstimate {
  direction: [number, number, number];
  color: [number, number, number];
}

export const DEFAULT_HDRI_LIGHT_ESTIMATE: HdriLightEstimate = {
  direction: [0.45, 0.72, 0.5],
  color: [1, 0.95, 0.88],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function copyDefaultEstimate(): HdriLightEstimate {
  return {
    direction: [...DEFAULT_HDRI_LIGHT_ESTIMATE.direction] as [number, number, number],
    color: [...DEFAULT_HDRI_LIGHT_ESTIMATE.color] as [number, number, number],
  };
}

function normalizeDirection(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  if (length < 0.0001) return [...DEFAULT_HDRI_LIGHT_ESTIMATE.direction] as [number, number, number];
  return [x / length, y / length, z / length];
}

/**
 * Estimate the direction of the brightest useful part of a scene/HDRI image.
 * The upper image area is preferred because it represents the visible sky/light
 * source; low-luminance pixels do not pull the key light toward the ground.
 */
export function estimateHdriLightDirection(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): HdriLightEstimate {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) return copyDefaultEstimate();

  const upperHeight = Math.max(1, Math.floor(height * 0.72));
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 64));
  let totalWeight = 0;
  let directionX = 0;
  let directionY = 0;
  let directionZ = 0;
  let colorR = 0;
  let colorG = 0;
  let colorB = 0;

  for (let y = 0; y < upperHeight; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const alpha = pixels[offset + 3] / 255;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const brightness = Math.max(luminance - 0.52, 0);
      const weight = alpha * brightness * brightness * (1 - (y / Math.max(upperHeight, 1)) * 0.35);
      if (weight <= 0) continue;

      const horizontalProgress = (x + 0.5) / width;
      const azimuth = horizontalProgress * Math.PI * 2 - Math.PI * 0.5;
      const verticalProgress = y / Math.max(upperHeight - 1, 1);
      const elevation = 1.1 - clamp(verticalProgress, 0, 1) * 0.95;
      const horizontalLength = Math.cos(elevation);
      const sampleDirectionX = Math.cos(azimuth) * horizontalLength;
      const sampleDirectionY = Math.sin(elevation);
      const sampleDirectionZ = Math.sin(azimuth) * horizontalLength;

      totalWeight += weight;
      directionX += sampleDirectionX * weight;
      directionY += sampleDirectionY * weight;
      directionZ += sampleDirectionZ * weight;
      colorR += red * weight;
      colorG += green * weight;
      colorB += blue * weight;
    }
  }

  if (totalWeight <= 0) return copyDefaultEstimate();

  return {
    direction: normalizeDirection(directionX, directionY, directionZ),
    color: [
      clamp(colorR / totalWeight, 0.72, 1),
      clamp(colorG / totalWeight, 0.72, 1),
      clamp(colorB / totalWeight, 0.72, 1),
    ],
  };
}

