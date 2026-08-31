const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  const binaryLength = buffer.readUInt32LE(binaryHeader);
  return { buffer, json, binaryStart: binaryHeader + 8, binaryLength };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  assert.ok(componentCount, `不支持的 accessor 类型：${accessor.type}`);
  const componentSize = 4;
  const offset = glb.binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    for (let component = 0; component < componentCount; component += 1) {
      row.push(glb.buffer.readFloatLE(offset + index * componentCount * componentSize + component * componentSize));
    }
    values.push(row);
  }
  return values;
}

function animationDuration(glb, animation) {
  let duration = 0;
  for (const sampler of animation.samplers ?? []) {
    for (const [time] of readAccessor(glb, sampler.input)) {
      duration = Math.max(duration, time);
    }
  }
  return duration;
}

function rootTranslationValues(glb, animation) {
  const rootNodes = new Set(
    (glb.json.nodes ?? [])
      .map((node, index) => [String(node.name ?? "").toLowerCase(), index])
      .filter(([name]) => name === "root")
      .map(([, index]) => index),
  );
  const values = [];
  for (const channel of animation.channels ?? []) {
    if (channel.target.path !== "translation" || !rootNodes.has(channel.target.node)) continue;
    const sampler = animation.samplers[channel.sampler];
    const output = readAccessor(glb, sampler.output);
    if (sampler.interpolation === "CUBICSPLINE") {
      values.push(...output.filter((_value, index) => index % 3 === 1));
    } else {
      values.push(...output);
    }
  }
  return values;
}

const ARM_CHAINS = [
  ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"],
  ["clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"],
];

function qMultiply(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function qNormalize(q) {
  const length = Math.hypot(...q);
  assert.ok(length > 1e-8, "动画四元数不能为零");
  return q.map((value) => value / length);
}

function qDot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function qRotate(q, vector) {
  const [x, y, z, w] = q;
  const uv = [
    y * vector[2] - z * vector[1],
    z * vector[0] - x * vector[2],
    x * vector[1] - y * vector[0],
  ];
  const uuv = [
    y * uv[2] - z * uv[1],
    z * uv[0] - x * uv[2],
    x * uv[1] - y * uv[0],
  ];
  return vector.map((value, index) => value + 2 * (w * uv[index] + uuv[index]));
}

function addVector(a, b) {
  return a.map((value, index) => value + b[index]);
}

function topologicalOrder(nodes) {
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  const order = [];
  const visited = new Set();
  const visit = (index) => {
    if (visited.has(index)) return;
    visited.add(index);
    if (parents.has(index)) visit(parents.get(index));
    order.push(index);
  };
  nodes.forEach((_, index) => visit(index));
  return { order, parents };
}

function makeTracks(glb, animation) {
  const tracks = new Map();
  for (const channel of animation?.channels ?? []) {
    const sampler = animation.samplers[channel.sampler];
    const output = readAccessor(glb, sampler.output);
    tracks.set(`${channel.target.node}:${channel.target.path}`, {
      times: readAccessor(glb, sampler.input).map(([time]) => time),
      values: sampler.interpolation === "CUBICSPLINE"
        ? output.filter((_value, index) => index % 3 === 1)
        : output,
    });
  }
  return tracks;
}

function sampleTrack(track, time) {
  if (!track || track.times.length === 0) return null;
  if (time <= track.times[0]) return track.values[0];
  if (time >= track.times.at(-1)) return track.values.at(-1);
  let index = 0;
  while (index < track.times.length - 2 && track.times[index + 1] <= time) index += 1;
  const fraction = (time - track.times[index]) /
    (track.times[index + 1] - track.times[index]);
  const left = track.values[index];
  let right = track.values[index + 1];
  if (left.length === 4) {
    if (qDot(left, right) < 0) right = right.map((value) => -value);
    return qNormalize(left.map((value, component) =>
      value + (right[component] - value) * fraction));
  }
  return left.map((value, component) =>
    value + (right[component] - value) * fraction);
}

function worldPositions(glb, animation, time) {
  const nodes = glb.json.nodes ?? [];
  const { order, parents } = topologicalOrder(nodes);
  const tracks = makeTracks(glb, animation);
  const worldRotation = new Map();
  const worldPosition = new Map();
  for (const index of order) {
    const node = nodes[index];
    const rotation = qNormalize(
      sampleTrack(tracks.get(`${index}:rotation`), time) ??
      node.rotation ?? [0, 0, 0, 1],
    );
    const translation = sampleTrack(tracks.get(`${index}:translation`), time) ??
      node.translation ?? [0, 0, 0];
    const parent = parents.get(index);
    worldRotation.set(
      index,
      parent === undefined ? rotation : qMultiply(worldRotation.get(parent), rotation),
    );
    worldPosition.set(
      index,
      parent === undefined
        ? translation
        : addVector(worldPosition.get(parent), qRotate(worldRotation.get(parent), translation)),
    );
  }
  return worldPosition;
}

function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function auditArmPoseEnvelope(glb, animation) {
  const nodeByName = new Map(
    (glb.json.nodes ?? []).map((node, index) => [String(node.name ?? "").toLowerCase(), index]),
  );
  const chains = ARM_CHAINS.map((chain) => chain.map((name) => nodeByName.get(name)));
  if (chains.some((chain) => chain.some((index) => index === undefined))) {
    return { passed: false, reason: "UAL2 GLB 缺少完整手臂骨链" };
  }

  const rest = worldPositions(glb, null, 0);
  const restLengths = chains.map((chain) => chain.slice(1).map((node, index) =>
    distance(rest.get(chain[index]), rest.get(node))));
  const duration = animationDuration(glb, animation);
  const times = duration > 0
    ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => duration * ratio)
    : [0];
  let maxReach = 0;
  let minReach = Number.POSITIVE_INFINITY;
  let maxSegmentLength = 0;
  let passed = true;
  for (const time of times) {
    const positions = worldPositions(glb, animation, time);
    chains.forEach((chain, chainIndex) => {
      const points = chain.map((node) => positions.get(node));
      if (points.some((point) => !point || point.some((value) => !Number.isFinite(value)))) {
        passed = false;
        return;
      }
      const reach = distance(points[0], points.at(-1));
      const totalLength = restLengths[chainIndex].reduce((sum, value) => sum + value, 0);
      maxReach = Math.max(maxReach, reach);
      minReach = Math.min(minReach, reach);
      if (reach <= 0.05 || reach > totalLength + 0.08) passed = false;
      points.slice(1).forEach((point, segmentIndex) => {
        const segmentLength = distance(points[segmentIndex], point);
        maxSegmentLength = Math.max(maxSegmentLength, segmentLength);
        const restLength = restLengths[chainIndex][segmentIndex];
        if (segmentLength <= 0.03 ||
            segmentLength < Math.max(0.04, restLength * 0.65) ||
            segmentLength > restLength * 1.35 + 0.04) passed = false;
      });
    });
  }
  return {
    passed,
    sampleCount: times.length,
    maxReach,
    minReach,
    maxSegmentLength,
  };
}

function main() {
  const [selectionPath, glbPath] = process.argv.slice(2);
  if (!selectionPath || !glbPath) {
    throw new Error("usage: node verify_animation_catalog.cjs <selection.json> <catalog.glb>");
  }
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  const glb = readGlb(glbPath);
  const animations = glb.json.animations ?? [];
  const names = animations.map((animation) => animation.name);
  assert.equal(new Set(names).size, names.length, "GLB 不得有重复动画名");
  const baseNames = names.filter((name) => !name.startsWith("C57_"));
  const selectedNames = selection.clips.map((clip) => clip.clipName);
  assert.deepEqual(
    names.slice(-selectedNames.length),
    selectedNames,
    "GLB 尾部片段必须按策选清单顺序追加",
  );
  assert.equal(
    names.length,
    baseNames.length + selectedNames.length,
    "GLB 动画数量不匹配",
  );
  assert.equal(
    selection.inPlacePolicy,
    "strict-source-in-place",
    "selection manifest must use the strict-source-in-place policy",
  );
  const animationsByName = new Map(animations.map((animation) => [animation.name, animation]));
  let maxRootTranslationRange = 0;
  let maxRootTranslationNet = 0;
  let maxArmReach = 0;
  let minArmReach = Number.POSITIVE_INFINITY;
  for (const clip of selection.clips) {
    assert.equal(clip.inPlace, true, `${clip.id} 必须标记为 in-place`);
    const animation = animationsByName.get(clip.clipName);
    assert.ok(animation, `GLB 缺少 ${clip.clipName}`);
    const metrics = measureRootTranslation(rootTranslationValues(glb, animation));
    maxRootTranslationRange = Math.max(maxRootTranslationRange, metrics.maxRange);
    maxRootTranslationNet = Math.max(maxRootTranslationNet, metrics.maxNet);
    assert.ok(
      isWithinRootTranslationLimit(metrics),
      `${clip.clipName} root 全局位移超限：range=${metrics.maxRange.toFixed(6)}m, net=${metrics.maxNet.toFixed(6)}m, limit=${MAX_ROOT_TRANSLATION_RANGE_METERS}m`,
    );
    const armAudit = auditArmPoseEnvelope(glb, animation);
    assert.ok(
      armAudit.passed,
      `${clip.clipName} 手臂骨链异常：${JSON.stringify(armAudit)}`,
    );
    maxArmReach = Math.max(maxArmReach, armAudit.maxReach ?? 0);
    minArmReach = Math.min(minArmReach, armAudit.minReach ?? Number.POSITIVE_INFINITY);
  }

  const joints = new Set((glb.json.skins ?? []).flatMap((skin) => skin.joints ?? []));
  const durations = new Map(animations.map((animation) => [animation.name, animationDuration(glb, animation)]));
  const durationByClip = new Map(selection.clips.map((clip) => [clip.clipName, clip.durationSeconds]));
  for (const animation of animations) {
    for (const channel of animation.channels ?? []) {
      const output = glb.json.accessors[animation.samplers[channel.sampler].output];
      if (channel.target.path === "rotation") {
        assert.equal(output.type, "VEC4", `${animation.name} 旋转通道必须是 VEC4`);
        for (const quaternion of readAccessor(glb, animation.samplers[channel.sampler].output)) {
          assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < 1e-4, `${animation.name} 存在非单位四元数`);
        }
      }
      if (channel.target.path === "translation") {
        assert.equal(output.type, "VEC3", `${animation.name} 平移通道必须是 VEC3`);
      }
      if (animation.name.startsWith("C57_")) {
        assert.ok(joints.has(channel.target.node), `${animation.name} 驱动了非 skin joint 节点`);
      }
    }
  }
  for (const [clipName, expectedDuration] of durationByClip) {
    assert.ok(durations.has(clipName), `GLB 缺少 ${clipName}`);
    assert.ok(
      Math.abs(durations.get(clipName) - expectedDuration) < 0.08,
      `${clipName} 时长不一致：${durations.get(clipName)} != ${expectedDuration}`,
    );
  }
  console.log(JSON.stringify({
    glb: path.resolve(glbPath),
    baseAnimationCount: baseNames.length,
    selectedAnimationCount: selectedNames.length,
    finalAnimationCount: names.length,
    skinJointCount: joints.size,
    maxRootTranslationRangeMeters: maxRootTranslationRange,
    maxRootTranslationNetMeters: maxRootTranslationNet,
    maxArmReachMeters: maxArmReach,
    minArmReachMeters: Number.isFinite(minArmReach) ? minArmReach : 0,
  }, null, 2));
}

main();
