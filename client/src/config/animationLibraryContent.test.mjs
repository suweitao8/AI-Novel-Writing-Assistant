import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ANIMATION_LIBRARY,
  filterAnimationLibraryEntries,
} from "./animationLibrary.ts";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(configDir, "../..");
const blockingCoreSource = fs.readFileSync(
  path.join(
    clientDir,
    "src",
    "pages",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "blocking3dViewerCore.ts",
  ),
  "utf8",
);
const blockingAppSource = fs.readFileSync(
  path.join(
    clientDir,
    "src",
    "pages",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "blocking3dViewerApp.ts",
  ),
  "utf8",
);
const IDENTITY = [0, 0, 0, 1];

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(
    buffer.toString("ascii", 0, 4),
    "glTF",
    `${filePath} 应是 GLB 文件`,
  );
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8"),
  );
  const binaryStart = 20 + jsonLength;
  const binaryLength = buffer.readUInt32LE(binaryStart);
  return {
    json,
    binary: buffer.subarray(binaryStart + 8, binaryStart + 8 + binaryLength),
  };
}

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  assert.ok(componentCount, `不支持的 accessor 类型：${accessor.type}`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Float32Array(
    glb.binary.buffer,
    glb.binary.byteOffset + offset,
    accessor.count * componentCount,
  );
  return Array.from({ length: accessor.count }, (_, index) =>
    Array.from(
      values.slice(index * componentCount, (index + 1) * componentCount),
    ),
  );
}

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

function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

function parentMap(nodes) {
  const parents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  return parents;
}

function topologicalOrder(nodes, parents) {
  const order = [];
  const visited = new Set();
  const visit = (index) => {
    if (visited.has(index)) return;
    visited.add(index);
    if (parents.has(index)) visit(parents.get(index));
    order.push(index);
  };
  nodes.forEach((_, index) => visit(index));
  return order;
}

function interpolate(track, time) {
  if (!track) return null;
  const { times, values } = track;
  if (time <= times[0]) return values[0];
  if (time >= times.at(-1)) return values.at(-1);
  let index = 0;
  while (index < times.length - 2 && times[index + 1] <= time) index += 1;
  const fraction = (time - times[index]) / (times[index + 1] - times[index]);
  const left = values[index];
  let right = values[index + 1];
  if (left.length === 4) {
    if (qDot(left, right) < 0) right = right.map((value) => -value);
    return qNormalize(
      left.map(
        (value, component) => value + (right[component] - value) * fraction,
      ),
    );
  }
  return left.map(
    (value, component) => value + (right[component] - value) * fraction,
  );
}

function makeTracks(glb, animation) {
  const tracks = new Map();
  for (const channel of animation?.channels ?? []) {
    const sampler = animation.samplers[channel.sampler];
    tracks.set(`${channel.target.node}:${channel.target.path}`, {
      times: readAccessor(glb, sampler.input).map(([time]) => time),
      values: readAccessor(glb, sampler.output),
    });
  }
  return tracks;
}

function rootTranslationMetrics(glb, animation) {
  const rootNodes = new Set(
    glb.json.nodes
      .map((node, index) => [String(node.name ?? "").toLowerCase(), index])
      .filter(([name]) => name === "root")
      .map(([, index]) => index),
  );
  const values = [];
  for (const channel of animation?.channels ?? []) {
    if (channel.target.path !== "translation" || !rootNodes.has(channel.target.node)) continue;
    const sampler = animation.samplers[channel.sampler];
    const output = readAccessor(glb, sampler.output);
    values.push(...(
      sampler.interpolation === "CUBICSPLINE"
        ? output.filter((_value, index) => index % 3 === 1)
        : output
    ));
  }
  if (values.length === 0) return { maxRange: 0, maxNet: 0 };
  const min = [0, 1, 2].map((component) => Math.min(...values.map((value) => value[component])));
  const max = [0, 1, 2].map((component) => Math.max(...values.map((value) => value[component])));
  const first = values[0];
  const last = values.at(-1);
  return {
    maxRange: Math.max(...max.map((value, component) => value - min[component])),
    maxNet: Math.max(...last.map((value, component) => Math.abs(value - first[component]))),
  };
}

function animationDuration(glb, animation) {
  let duration = 0;
  for (const sampler of animation?.samplers ?? []) {
    for (const [time] of readAccessor(glb, sampler.input)) {
      duration = Math.max(duration, time);
    }
  }
  return duration;
}

function composePose(glb, animationName = null, time = 0) {
  const nodes = glb.json.nodes;
  const parents = parentMap(nodes);
  const order = topologicalOrder(nodes, parents);
  const animation = animationName
    ? glb.json.animations.find(({ name }) => name === animationName)
    : null;
  const tracks = makeTracks(glb, animation);
  const worldRotation = new Map();
  const worldPosition = new Map();

  for (const index of order) {
    const node = nodes[index];
    const rotation =
      interpolate(tracks.get(`${index}:rotation`), time) ??
      node.rotation ??
      IDENTITY;
    const translation = interpolate(tracks.get(`${index}:translation`), time) ??
      node.translation ?? [0, 0, 0];
    const parent = parents.get(index);
    worldRotation.set(
      index,
      parent === undefined
        ? rotation
        : qMultiply(worldRotation.get(parent), rotation),
    );
    worldPosition.set(
      index,
      parent === undefined
        ? translation
        : add(
            worldPosition.get(parent),
            qRotate(worldRotation.get(parent), translation),
          ),
    );
  }
  return {
    duration: animationDuration(glb, animation),
    nodes,
    worldRotation,
    worldPosition,
  };
}

function nodeIndexByName(glb) {
  return new Map(
    glb.json.nodes.map((node, index) => [
      (node.name ?? "").toLowerCase(),
      index,
    ]),
  );
}

function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function assetPath() {
  const entry = ANIMATION_LIBRARY[0];
  assert.ok(entry, "动画目录不能为空");
  return path.join(clientDir, "public", entry.fileUrl);
}

test("动画目录由四条导入验证动作与内置兼容库组成", () => {
  const unrealEntries = ANIMATION_LIBRARY.filter((entry) => entry.source === "unreal");
  const legacyEntries = ANIMATION_LIBRARY.filter((entry) => entry.source === "legacy");
  assert.equal(unrealEntries.length, 4);
  assert.equal(legacyEntries.length, 46);
  assert.equal(ANIMATION_LIBRARY.length, 50);
  assert.equal(ANIMATION_LIBRARY[0]?.source, "unreal");
  assert.ok(unrealEntries.every((entry) => entry.motionMode === "root-motion" && !entry.inPlace));
  assert.ok(legacyEntries.every((entry) => !entry.inPlace));
  assert.equal(
    filterAnimationLibraryEntries(unrealEntries, { groupId: "unreal-hand-combat" }).length,
    4,
  );
  assert.equal(
    filterAnimationLibraryEntries(unrealEntries, { groupId: "unreal-daily" }).length,
    0,
  );
  assert.equal(
    filterAnimationLibraryEntries(unrealEntries, { groupId: "unreal-interaction" }).length,
    0,
  );
  assert.equal(
    filterAnimationLibraryEntries(unrealEntries, { groupId: "unreal-weapon-combat" }).length,
    0,
  );
  assert.ok(unrealEntries.every((entry) => entry.sourceAssetPath?.startsWith("/Game/Characters/Mannequins/Anims/Unarmed/Attack/")));
});

test("导入动画保留动作姿态，且坐姿不会产生异常骨盆位移", () => {
  const glb = readGlb(assetPath());
  const nodes = nodeIndexByName(glb);
  const rest = composePose(glb);
  const idle = composePose(glb, "A_INP_Idle", 2.7083332538604736 * 0.4);
  const chair = composePose(glb, "A_chair_loop01", 4 * 0.4);

  const idleHand = idle.worldPosition.get(nodes.get("hand_l"));
  const idleShoulder = idle.worldPosition.get(nodes.get("clavicle_l"));
  assert.ok(
    idleHand[1] - idleShoulder[1] < -0.1,
    `待机左手应低于肩部，实际差值为 ${(idleHand[1] - idleShoulder[1]).toFixed(3)}`,
  );
  assert.ok(
    idleHand[1] - idleShoulder[1] < -0.4,
    `待机手部仍接近错误的 T-Pose 基准，实际差值为 ${(idleHand[1] - idleShoulder[1]).toFixed(3)}`,
  );

  const walkAnimation = glb.json.animations.find(
    ({ name }) => name === "A_INP_WalkFwd_Loop",
  );
  assert.ok(walkAnimation, "统一 GLB 必须包含导入的行走片段");
  const walk = composePose(
    glb,
    walkAnimation.name,
    animationDuration(glb, walkAnimation) * 0.4,
  );
  const handDelta = (pose, handName, shoulderName) => {
    const hand = pose.worldPosition.get(nodes.get(handName));
    const shoulder = pose.worldPosition.get(nodes.get(shoulderName));
    return hand[1] - shoulder[1];
  };
  assert.ok(
    (handDelta(walk, "hand_l", "clavicle_l") +
      handDelta(walk, "hand_r", "clavicle_r")) /
      2 <
      -0.32,
    "行走双手平均高度仍接近错误的水平基准",
  );

  const attackNames = [
    "C57_anim57_unarmed_attack_mm_attack_01",
    "C57_anim57_unarmed_attack_mm_attack_02",
    "C57_anim57_unarmed_attack_mm_attack_03",
    "C57_anim57_unarmed_attack_mm_charged_attack",
  ];
  for (const name of attackNames) {
    const animation = glb.json.animations.find((candidate) => candidate.name === name);
    assert.ok(animation, `统一 GLB 必须包含验证动作 ${name}`);
    const times = Array.from({ length: 5 }, (_, index) =>
      (animationDuration(glb, animation) * index) / 4,
    );
    for (const time of times) {
      const pose = composePose(glb, name, time);
      for (const side of ["l", "r"]) {
        const chain = [
          `clavicle_${side}`,
          `upperarm_${side}`,
          `lowerarm_${side}`,
          `hand_${side}`,
        ].map((boneName) => nodes.get(boneName));
        for (let index = 1; index < chain.length; index += 1) {
          const segmentLength = distance(
            pose.worldPosition.get(chain[index - 1]),
            pose.worldPosition.get(chain[index]),
          );
          assert.ok(
            segmentLength > 0.03 && Number.isFinite(segmentLength),
            `${name} ${side} 臂骨链疑似断裂：${segmentLength.toFixed(3)}m`,
          );
        }
      }
    }
  }

  const restPelvis = rest.worldPosition.get(nodes.get("pelvis"));
  const chairPelvis = chair.worldPosition.get(nodes.get("pelvis"));
  assert.ok(
    distance(chairPelvis, restPelvis) < 0.75,
    `坐姿骨盆相对绑定姿态位移过大：${distance(chairPelvis, restPelvis).toFixed(3)}`,
  );
});

test("导入动画通道使用合法单位四元数并且只驱动 skin joints", () => {
  const glb = readGlb(assetPath());
  const joints = new Set((glb.json.skins ?? []).flatMap((skin) => skin.joints));
  for (const animation of glb.json.animations ?? []) {
    if (animation.name.startsWith("C57_")) {
      const metrics = rootTranslationMetrics(glb, animation);
      const entry = ANIMATION_LIBRARY.find((candidate) => candidate.clipName === animation.name);
      assert.ok(entry, `统一目录缺少 ${animation.name} 的元数据`);
      if (entry.motionMode === "in-place") {
        assert.ok(
          metrics.maxRange <= 0.030001 && metrics.maxNet <= 0.030001,
          `${animation.name} root 全局位移超限：${JSON.stringify(metrics)}`,
        );
      } else {
        assert.ok(
          metrics.maxRange > 0.03 || metrics.maxNet > 0.03,
          `${animation.name} 声明为 root-motion，但没有可观察的根位移：${JSON.stringify(metrics)}`,
        );
      }
    }
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const output = glb.json.accessors[sampler.output];
      if (channel.target.path === "rotation") {
        assert.equal(
          output.type,
          "VEC4",
          `${animation.name} 的旋转通道必须是 VEC4`,
        );
        for (const quaternion of readAccessor(glb, sampler.output)) {
          assert.ok(
            Math.abs(Math.hypot(...quaternion) - 1) < 1e-4,
            `${animation.name} 存在非单位四元数`,
          );
        }
      }
      if (animation.name.startsWith("A_")) {
        assert.ok(
          joints.has(channel.target.node),
          `${animation.name} 驱动了非 skin joint 节点`,
        );
      }
      if (animation.name.startsWith("C57_")) {
        assert.ok(
          joints.has(channel.target.node),
          `${animation.name} 驱动了非 skin joint 节点`,
        );
      }
    }
  }
});

test("已发布虚幻源组在统一 GLB 中保留代表性动作片段", () => {
  const glb = readGlb(assetPath());
  const animationNames = new Set((glb.json.animations ?? []).map(({ name }) => name));
  const unrealEntries = ANIMATION_LIBRARY.filter((entry) => entry.source === "unreal");
  for (const entry of unrealEntries) {
    assert.ok(animationNames.has(entry.clipName), `统一动画文件缺少虚幻代表片段：${entry.clipName}`);
    assert.equal(entry.motionMode, "root-motion", `${entry.clipName} 必须明确标记为 root-motion`);
    assert.equal(entry.inPlace, false, `${entry.clipName} 的 inPlace 必须与 root-motion 一致`);
  }
  for (const groupId of ["unreal-daily", "unreal-interaction", "unreal-misc", "unreal-weapon-combat"]) {
    assert.equal(
      unrealEntries.some((candidate) => candidate.groupId === groupId),
      false,
      `${groupId} 已在策展剪枝中下架，不应出现在目录里`,
    );
  }
});

test("动画库与分镜草图共用含 UAL2 角色和动作的单一 GLB", () => {
  const glb = readGlb(assetPath());
  const animationNames = new Set(
    (glb.json.animations ?? []).map(({ name }) => name),
  );
  for (const name of ["A_INP_Idle", "A_INP_WalkFwd_Loop", "A_chair_loop01"]) {
    assert.ok(animationNames.has(name), `统一动画文件缺少目录片段：${name}`);
  }
  assert.ok(
    (glb.json.skins ?? []).some((skin) => (skin.joints ?? []).length > 0),
    "统一动画文件必须包含 UAL2 skin",
  );
  assert.match(
    blockingCoreSource,
    /ACTOR_PROXY_URL = ["']\/anims\/cine57\/UAL2_UE_Anims\.glb["']/,
  );
  assert.doesNotMatch(blockingCoreSource, /UAL1_Standard\.glb/);
  assert.doesNotMatch(blockingAppSource, /ACTOR_ANIMATION_URL|animationAsset/);
});

test("分镜运行时用姿势解析器校验统一文件的基础待机动作", () => {
  assert.match(
    blockingAppSource,
    /resolveBlocking3dPoseClip\("standing", animationTracks\.keys\(\)\)/,
  );
  assert.doesNotMatch(blockingAppSource, /animationTracks\.has\("Idle_Loop"\)/);
});

test("分镜姿势选择器只使用统一 GLB 的可用姿势，并保留业务姿势语义", () => {
  assert.match(blockingAppSource, /getAvailableBlocking3dPoses/);
  assert.match(blockingCoreSource, /resolveBlocking3dPosePresentation/);
  assert.match(blockingCoreSource, /actor\.pose = pose/);
  assert.doesNotMatch(blockingCoreSource, /appliedPose\s*=\s*["']standing["']/);
  assert.match(blockingAppSource, /getAvailablePoses/);
});

test("行走片段保留双脚的明显交替运动", () => {
  const glb = readGlb(assetPath());
  const nodes = nodeIndexByName(glb);
  const animation = glb.json.animations.find(
    ({ name }) => name === "A_INP_WalkFwd_Loop",
  );
  const duration = animationDuration(glb, animation);
  const samples = Array.from({ length: 9 }, (_, index) =>
    composePose(glb, animation.name, (duration * index) / 8),
  );
  const left = samples.map((pose) =>
    pose.worldPosition.get(nodes.get("foot_l")),
  );
  const right = samples.map((pose) =>
    pose.worldPosition.get(nodes.get("foot_r")),
  );
  const range = (points, component) =>
    Math.max(...points.map((point) => point[component])) -
    Math.min(...points.map((point) => point[component]));
  assert.ok(range(left, 1) > 0.2 || range(left, 2) > 0.2, "左脚没有明显轨迹");
  assert.ok(range(right, 1) > 0.2 || range(right, 2) > 0.2, "右脚没有明显轨迹");
});
