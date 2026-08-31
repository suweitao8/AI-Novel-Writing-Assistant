const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

function hasRootTranslationChannel(glb, animation) {
  const rootNodes = new Set(
    (glb.json.nodes ?? [])
      .map((node, index) => [String(node.name ?? "").toLowerCase(), index])
      .filter(([name]) => name === "root")
      .map(([, index]) => index),
  );
  return (animation.channels ?? []).some((channel) =>
    channel.target.path === "translation" && rootNodes.has(channel.target.node),
  );
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
  const animationsByName = new Map(animations.map((animation) => [animation.name, animation]));
  for (const clip of selection.clips) {
    assert.equal(clip.rootMotion, true, `${clip.id} 必须标记为 root-motion`);
    const animation = animationsByName.get(clip.clipName);
    assert.ok(animation, `GLB 缺少 ${clip.clipName}`);
    assert.ok(
      hasRootTranslationChannel(glb, animation),
      `${clip.clipName} 必须驱动 root 平移通道`,
    );
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
  }, null, 2));
}

main();
