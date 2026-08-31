/**
 * @deprecated Kept for historical manifest tests only. The import pipeline
 * uses inPlaceAnimationPolicy.cjs and never admits Root Motion sources.
 */
const ROOT_MOTION_PATH_MARKER = /(?:^|[\\/])root(?:[-_ ]?motion)?(?=[\\/]|$)/i;
const ROOT_MOTION_NAME_MARKER = /(?:^|[_-])(?:rm|root(?:[-_ ]?motion)?)(?=[_-]|$)/i;
const IN_PLACE_MARKER = /(?:^|[\\/_-])in[-_ ]?place(?=[\\/_-]|$)/i;

function normalize(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

/**
 * Return the durable source evidence used by the selection builder.
 * `InPlace` wins over a coincidental Root token so an incorrectly organized
 * source row cannot enter the root-motion-only catalog.
 */
function getRootMotionEvidence(row) {
  const assetPath = normalize(row?.assetPath);
  const assetName = normalize(row?.assetName);
  if (IN_PLACE_MARKER.test(`${assetPath}/${assetName}`)) return null;
  if (ROOT_MOTION_PATH_MARKER.test(assetPath)) return "source-path";
  if (ROOT_MOTION_NAME_MARKER.test(assetName)) return "asset-name";
  return null;
}

function isRootMotionSource(row) {
  return getRootMotionEvidence(row) !== null;
}

/**
 * Return only deterministic naming counterparts. The scan still decides
 * whether a counterpart exists and whether it is actually root-motion.
 */
function getRootMotionNameCandidates(assetName) {
  const original = String(assetName ?? "");
  const candidates = [];
  const add = (value) => {
    const normalized = value.replace(/[_-]{2,}/g, (match) => match[0]).replace(/[_-]+$/g, "");
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  add(original);
  const hasInPlaceToken = /(?:^|[_-])(?:inp|ip|in[-_ ]?place)(?=[_-]|$)/i.test(original);
  add(original.replace(/(^|[_-])inp(?=[_-]|$)/gi, "$1"));
  add(original.replace(/(^|[_-])ip(?=[_-]|$)/gi, "$1RM"));
  add(original.replace(/(^|[_-])ip(?=[_-]|$)/gi, "$1"));
  add(original.replace(/(^|[_-])in[-_ ]?place(?=[_-]|$)/gi, "$1Root"));
  if (!hasInPlaceToken && !/(?:^|[_-])(?:rm|root)(?=[_-]|$)/i.test(original)) {
    add(`${original}_Root`);
  }
  return candidates;
}

module.exports = {
  getRootMotionEvidence,
  getRootMotionNameCandidates,
  isRootMotionSource,
};
