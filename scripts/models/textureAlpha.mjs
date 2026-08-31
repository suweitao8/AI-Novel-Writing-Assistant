const ALPHA_PIXEL_FORMAT_PATTERN = /^(?:rgba|argb|bgra|abgr|ya\d*|yuva|gbrap|gbra|pal8)(?:\d+)?(?:le|be)?$/i;
const ALPHA_MINIMUM_PATTERN = /\bYMIN\s*(?:=|:)\s*([0-9]+(?:\.[0-9]+)?)/gi;
const OPAQUE_ALPHA_MINIMUM = 254;

/** Return whether an FFmpeg pixel format can carry an alpha channel. */
export function hasAlphaPixelFormat(pixelFormat) {
  return ALPHA_PIXEL_FORMAT_PATTERN.test(String(pixelFormat ?? "").trim());
}

/**
 * Parse the minimum alpha value emitted by signalstats/metadata=print.
 * FFmpeg versions use both `YMIN=0` and `YMIN:0` forms.
 */
export function parseAlphaMinimum(output) {
  const values = [];
  for (const match of String(output ?? "").matchAll(ALPHA_MINIMUM_PATTERN)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * Decide whether a converted texture must retain alpha.
 * Unknown alpha statistics fail safe: dropping an unverified alpha channel is
 * materially worse than keeping a PNG for a texture that happens to be opaque.
 */
export function shouldPreserveAlpha({ pixelFormat, ffmpegOutput, forceOpaque = false } = {}) {
  if (forceOpaque || !hasAlphaPixelFormat(pixelFormat)) return false;
  const minimum = parseAlphaMinimum(ffmpegOutput);
  return minimum === null || minimum < OPAQUE_ALPHA_MINIMUM;
}

export function getTextureOutputExtension(options = {}) {
  return shouldPreserveAlpha(options) ? "png" : "jpg";
}
