const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const {
  MAX_ROOT_TRANSLATION_RANGE_METERS,
  measureRootTranslation,
  isWithinRootTranslationLimit,
} = require("./inPlaceAnimationPolicy.cjs");

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "glTF", `${filePath} 应是 GLB`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buffer.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"));
  const binaryHeader = jsonStart + jsonLength;
  assert.equal(buffer.toString("ascii", binaryHeader + 4, binaryHeader + 8), "BIN\0", `${filePath} 缺少 BIN chunk`);
  return { buffer, json, binaryStart: binaryHeader + 8 };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const componentReaders = {
    5121: { size: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
    5123: { size: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
    5125: { size: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
    5126: { size: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
  };
  assert.ok(componentCount, `不支持的 accessor 类型：${accessor.type}`);
  const componentReader = componentReaders[accessor.componentType];
  assert.ok(componentReader, `不支持的 accessor componentType：${accessor.componentType}`);
  const offset = glb.binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? componentCount * componentReader.size;
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const rowOffset = offset + index * stride;
    const row = Array.from({ length: componentCount }, (_, component) =>
      componentReader.read(glb.buffer, rowOffset + component * componentReader.size));
    values.push(componentCount === 1 ? row[0] : row);
  }
  return values;
}

function getAnimationRootTranslationValues(glb, animationName) {
  const rootNodes = new Set(
    (glb.json.nodes ?? [])
      .map((node, index) => [String(node.name ?? "").toLowerCase(), index])
      .filter(([name]) => name === "root")
      .map(([, index]) => index),
  );
  const animations = (glb.json.animations ?? []).filter((animation) =>
    animationName == null || animation.name === animationName);
  const values = [];
  for (const animation of animations) {
    for (const channel of animation.channels ?? []) {
      if (channel.target?.path !== "translation" || !rootNodes.has(channel.target?.node)) continue;
      const sampler = animation.samplers?.[channel.sampler];
      if (!sampler) continue;
      const output = readAccessor(glb, sampler.output);
      if (sampler.interpolation === "CUBICSPLINE") {
        values.push(...output.filter((_value, index) => index % 3 === 1));
      } else {
        values.push(...output);
      }
    }
  }
  return values;
}

function auditRootTranslation(filePath, animationName) {
  const glb = readGlb(filePath);
  const values = getAnimationRootTranslationValues(glb, animationName);
  const metrics = measureRootTranslation(values);
  return {
    animationName,
    hasRootTranslationChannel: values.length > 0,
    metrics,
    passed: isWithinRootTranslationLimit(metrics),
  };
}

function filterSelection(selection, glbDir) {
  assert.equal(
    selection.inPlacePolicy,
    "strict-source-in-place",
    "selection manifest must use the strict-source-in-place policy",
  );
  const accepted = [];
  const rejected = [];
  const audits = [];
  for (const clip of selection.clips ?? []) {
    assert.equal(clip.inPlace, true, `${clip.id} 必须标记为 in-place 候选`);
    const glbPath = path.join(glbDir, clip.glbFileName);
    assert.ok(fs.statSync(glbPath, { throwIfNoEntry: false })?.isFile(), `缺少源 GLB：${glbPath}`);
    const audit = auditRootTranslation(glbPath);
    audits.push({
      id: clip.id,
      glbFileName: clip.glbFileName,
      hasRootTranslationChannel: audit.hasRootTranslationChannel,
      ...audit.metrics,
      passed: audit.passed,
    });
    if (audit.passed) {
      accepted.push({
        ...clip,
        rootTranslationMaxRangeMeters: audit.metrics.maxRange,
        rootTranslationMaxNetMeters: audit.metrics.maxNet,
      });
      continue;
    }
    rejected.push({
      id: clip.id,
      packId: clip.packId,
      key: clip.id.replace(`${clip.packId}-`, ""),
      name: clip.name,
      actionType: clip.actionType,
      sourcePack: clip.sourcePack,
      sourceAssetPath: clip.sourceAssetPath,
      sourceAssetName: clip.sourceAssetName,
      sourceSkeleton: clip.sourceSkeleton,
      glbFileName: clip.glbFileName,
      reason: "root-displacement-too-large",
      rootTranslationRangeMeters: audit.metrics.range,
      rootTranslationMaxRangeMeters: audit.metrics.maxRange,
      rootTranslationNetMeters: audit.metrics.net,
      rootTranslationMaxNetMeters: audit.metrics.maxNet,
    });
  }
  assert.ok(accepted.length > 0, "root translation audit rejected every candidate");
  const groupIds = new Set(accepted.map((clip) => clip.groupId));
  for (const groupId of Object.keys(selection.groups ?? {})) {
    assert.ok(groupIds.has(groupId), `in-place catalog has no selected asset for group ${groupId}`);
  }
  return {
    ...selection,
    schemaVersion: 3,
    inPlacePolicy: "strict-source-in-place",
    rootTranslationMaxRangeMeters: MAX_ROOT_TRANSLATION_RANGE_METERS,
    rootTranslationAudit: {
      rule: "root translation max axis range and net displacement must be <= 0.03m; missing root translation is accepted",
      auditedClipCount: audits.length,
      acceptedClipCount: accepted.length,
      rejectedClipCount: rejected.length,
      rejectedClipIds: rejected.map((clip) => clip.id),
    },
    clips: accepted,
    droppedClips: [...(selection.droppedClips ?? []), ...rejected],
  };
}

function main() {
  const [selectionPath, glbDir, outputPath, reportPath] = process.argv.slice(2);
  if (!selectionPath || !glbDir || !outputPath) {
    throw new Error("usage: node filter_animation_catalog_selection.cjs <candidate-selection.json> <glb-dir> <output-selection.json> [audit.json]");
  }
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  const filtered = filterSelection(selection, path.resolve(glbDir));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(filtered.rootTranslationAudit, null, 2)}\n`, "utf8");
  }
  console.log(
    `audited ${filtered.rootTranslationAudit.auditedClipCount} candidates; `
      + `accepted ${filtered.clips.length}; rejected ${filtered.rootTranslationAudit.rejectedClipCount} -> ${outputPath}`,
  );
}

if (require.main === module) main();

module.exports = {
  auditRootTranslation,
  filterSelection,
  getAnimationRootTranslationValues,
  readGlb,
};
