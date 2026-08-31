const ROOT_MOTION_PATH_MARKER = /(?:^|[\\/])root(?:[-_ ]?motion)?(?=[\\/]|$)/i;
const ROOT_MOTION_NAME_MARKER = /(?:^|[_-])(?:rm|root(?:[-_ ]?motion)?)(?=[_-]|$)/i;
const IN_PLACE_PATH_MARKER = /(?:^|[\\/])in[-_ ]?place(?=[\\/]|$)/i;
const IN_PLACE_NAME_MARKER = /(?:^|[_-])(?:inp|ip|in[-_ ]?place)(?=[_-]|$)/i;

// Global actor movement above this amount makes storyboard blocking harder to
// reuse. The limit is intentionally small enough to allow export jitter while
// rejecting walking/running root motion.
const MAX_ROOT_TRANSLATION_RANGE_METERS = 0.03;

function normalize(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

/**
 * Return evidence that a curated UE source is suitable for an in-place clip.
 * Exact curated rows without an explicit root/in-place marker are allowed;
 * their converted GLB still has to pass the numeric root-translation gate.
 */
function getInPlaceSourceEvidence(row) {
  const assetPath = normalize(row?.assetPath);
  const assetName = normalize(row?.assetName);
  if (ROOT_MOTION_PATH_MARKER.test(assetPath) || ROOT_MOTION_NAME_MARKER.test(assetName)) {
    return null;
  }
  if (IN_PLACE_PATH_MARKER.test(assetPath)) return "source-path";
  if (IN_PLACE_NAME_MARKER.test(assetName)) return "asset-name";
  return "unmarked-non-root";
}

function isInPlaceSource(row) {
  return getInPlaceSourceEvidence(row) !== null;
}

function getInPlaceNameCandidates(assetName) {
  const original = String(assetName ?? "");
  const candidates = [];
  const add = (value) => {
    const normalized = value.replace(/[_-]{2,}/g, (match) => match[0]).replace(/[_-]+$/g, "");
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  add(original);
  add(original.replace(/(^|[_-])inp(?=[_-]|$)/gi, "$1"));
  add(original.replace(/(^|[_-])ip(?=[_-]|$)/gi, "$1"));
  add(original.replace(/(^|[_-])in[-_ ]?place(?=[_-]|$)/gi, "$1"));
  return candidates;
}

function normalizeVector(value) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return [0, 0, 0];
  return [0, 1, 2].map((index) => {
    const component = Number(value[index]);
    return Number.isFinite(component) ? component : 0;
  });
}

function measureRootTranslation(values) {
  const samples = Array.from(values ?? [], normalizeVector);
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      min: [0, 0, 0],
      max: [0, 0, 0],
      range: [0, 0, 0],
      maxRange: 0,
      net: [0, 0, 0],
      maxNet: 0,
    };
  }

  const min = [0, 1, 2].map((component) => Math.min(...samples.map((sample) => sample[component])));
  const max = [0, 1, 2].map((component) => Math.max(...samples.map((sample) => sample[component])));
  const range = max.map((value, component) => value - min[component]);
  const net = max.map((_, component) => samples[samples.length - 1][component] - samples[0][component]);
  return {
    sampleCount: samples.length,
    min,
    max,
    range,
    maxRange: Math.max(...range),
    net,
    maxNet: Math.max(...net.map((value) => Math.abs(value))),
  };
}

function isWithinRootTranslationLimit(metrics, maxRange = MAX_ROOT_TRANSLATION_RANGE_METERS) {
  return Number(metrics?.maxRange ?? 0) <= maxRange + 1e-6
    && Number(metrics?.maxNet ?? 0) <= maxRange + 1e-6;
}

module.exports = {
  MAX_ROOT_TRANSLATION_RANGE_METERS,
  getInPlaceSourceEvidence,
  isInPlaceSource,
  getInPlaceNameCandidates,
  measureRootTranslation,
  isWithinRootTranslationLimit,
};
