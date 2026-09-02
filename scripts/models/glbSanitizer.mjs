import fs from "node:fs";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COLLISION_NAME = /^(?:UCX|UBX|UBP|UCP|USP|UCOL)(?:[_-]|$)/i;
const HIGHER_LOD_NAME = /(?:^|[_-])LOD[_-]?([1-9]\d*)$/i;

export function getUnsupportedNameReason(name) {
  const value = String(name ?? "");
  if (COLLISION_NAME.test(value)) return "collision";
  if (HIGHER_LOD_NAME.test(value)) return "higher-lod";
  return null;
}

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

function readChunk(buffer, offset) {
  if (offset + 8 > buffer.length) throw new Error(`GLB chunk header exceeds file at ${offset}`);
  const length = buffer.readUInt32LE(offset);
  const type = buffer.readUInt32LE(offset + 4);
  const start = offset + 8;
  const end = start + length;
  if (end > buffer.length) throw new Error(`GLB chunk exceeds file at ${offset}`);
  return { length, type, data: buffer.subarray(start, end), offset, end };
}

/** Parse a GLB while preserving every non-JSON chunk for a lossless rewrite. */
export function readGlb(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("GLB input must be a Buffer");
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB magic");
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) throw new Error("Only GLB version 2 is supported");

  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    throw new Error(`GLB length mismatch: header=${declaredLength}, actual=${buffer.length}`);
  }

  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    const chunk = readChunk(buffer, offset);
    chunks.push(chunk);
    offset = chunk.end;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
  if (!jsonChunk) throw new Error("GLB JSON chunk is missing");
  let json;
  try {
    json = JSON.parse(jsonChunk.data.toString("utf8").trim());
  } catch (error) {
    throw new Error(`GLB JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    json,
    chunks,
    binChunk: chunks.find((chunk) => chunk.type === BIN_CHUNK) ?? null,
  };
}

function uniqueMappedChildren(nodeIndex, nodes, dropNodes, nodeMap, active = new Set()) {
  if (active.has(nodeIndex)) throw new Error(`GLB node cycle detected at ${nodeIndex}`);
  if (!dropNodes.has(nodeIndex)) return nodeMap.has(nodeIndex) ? [nodeMap.get(nodeIndex)] : [];

  const nextActive = new Set(active);
  nextActive.add(nodeIndex);
  const output = [];
  for (const child of nodes[nodeIndex]?.children ?? []) {
    for (const mapped of uniqueMappedChildren(child, nodes, dropNodes, nodeMap, nextActive)) {
      if (!output.includes(mapped)) output.push(mapped);
    }
  }
  return output;
}

function remapNodeReferences(json, nodeMap, dropNodes) {
  const nodes = json.nodes ?? [];
  const remapChildren = (children) => {
    const output = [];
    for (const child of children ?? []) {
      for (const mapped of uniqueMappedChildren(child, nodes, dropNodes, nodeMap)) {
        if (!output.includes(mapped)) output.push(mapped);
      }
    }
    return output;
  };

  for (const scene of json.scenes ?? []) {
    if (!Array.isArray(scene.nodes)) continue;
    const mapped = remapChildren(scene.nodes);
    if (mapped.length > 0) scene.nodes = mapped;
    else delete scene.nodes;
  }

  for (const skin of json.skins ?? []) {
    if (Array.isArray(skin.joints)) {
      skin.joints = skin.joints.filter((node) => nodeMap.has(node)).map((node) => nodeMap.get(node));
    }
    if (skin.skeleton !== undefined) {
      if (nodeMap.has(skin.skeleton)) skin.skeleton = nodeMap.get(skin.skeleton);
      else delete skin.skeleton;
    }
  }

  for (const animation of json.animations ?? []) {
    if (!Array.isArray(animation.channels)) continue;
    animation.channels = animation.channels.filter((channel) => {
      const targetNode = channel.target?.node;
      return targetNode === undefined || nodeMap.has(targetNode);
    });
    for (const channel of animation.channels) {
      if (channel.target?.node !== undefined) channel.target.node = nodeMap.get(channel.target.node);
    }
  }

  const remappedNodes = [];
  for (const [oldIndex, newIndex] of nodeMap) {
    const original = nodes[oldIndex];
    const node = { ...original };
    if (node.mesh !== undefined) node.mesh = json.__meshMap.get(node.mesh);
    if (Array.isArray(original.children)) {
      const children = remapChildren(original.children);
      if (children.length > 0) node.children = children;
      else delete node.children;
    }
    remappedNodes[newIndex] = node;
  }
  json.nodes = remappedNodes;
}

function writeGlb(json, chunks) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = Buffer.alloc(pad4(jsonBytes.length), 0x20);
  const bodyChunks = chunks.map((chunk) => {
    if (chunk.type === JSON_CHUNK) return { type: JSON_CHUNK, data: Buffer.concat([jsonBytes, jsonPadding]) };
    return { type: chunk.type, data: chunk.data };
  });
  const totalLength = 12 + bodyChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of bodyChunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

/**
 * FBX2glTF 会把 FBX 源里残留的透明因子转成 BLEND/MASK alphaMode；材质若不引用
 * 任何贴图（目录侧回填外观），就不存在 alpha 通道，BLEND 只会误导渲染器与门禁。
 * 无贴图的透明模式重写为 OPAQUE 是纯结构修正，不改变视觉。
 */
function hasTexturelessBlendMaterials(json) {
  return (Array.isArray(json.materials) ? json.materials : []).some((material) => {
    if (material?.alphaMode !== "BLEND" && material?.alphaMode !== "MASK") return false;
    const pbrTextures = material.pbrMetallicRoughness ?? {};
    return ![material.normalTexture, pbrTextures.baseColorTexture, pbrTextures.metallicRoughnessTexture]
      .some((tex) => tex?.index !== undefined && tex?.index !== null);
  });
}

function normalizeTexturelessBlendMaterials(json) {
  for (const material of Array.isArray(json.materials) ? json.materials : []) {
    if (material?.alphaMode !== "BLEND" && material?.alphaMode !== "MASK") continue;
    const pbrTextures = material.pbrMetallicRoughness ?? {};
    const hasTexture = [material.normalTexture, pbrTextures.baseColorTexture, pbrTextures.metallicRoughnessTexture]
      .some((tex) => tex?.index !== undefined && tex?.index !== null);
    if (!hasTexture) {
      delete material.alphaMode;
      delete material.alphaCutoff;
    }
  }
}

/**
 * Remove UE collision nodes/meshes and LOD1+ from a GLB without touching BIN data.
 * The result also removes references to dropped nodes and promotes their valid children.
 */
export function stripUnsupportedGlb(buffer) {
  const { json, chunks } = readGlb(buffer);
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const keepMesh = new Map();
  const removedMeshNames = [];

  meshes.forEach((mesh, index) => {
    const name = String(mesh.name ?? "");
    if (getUnsupportedNameReason(name)) removedMeshNames.push(name);
    else keepMesh.set(index, keepMesh.size);
  });

  const dropNodes = new Set();
  const removedNodeNames = [];
  nodes.forEach((node, index) => {
    const name = String(node.name ?? "");
    const reason = getUnsupportedNameReason(name);
    const referencesDroppedMesh = node.mesh !== undefined && !keepMesh.has(node.mesh);
    if (reason || referencesDroppedMesh) {
      dropNodes.add(index);
      removedNodeNames.push(name || `node#${index}`);
    }
  });

  if (removedMeshNames.length === 0 && removedNodeNames.length === 0 && !hasTexturelessBlendMaterials(json)) {
    return { buffer, changed: false, removedMeshNames, removedNodeNames };
  }

  const nodeMap = new Map();
  nodes.forEach((_, index) => {
    if (!dropNodes.has(index)) nodeMap.set(index, nodeMap.size);
  });

  const nextJson = JSON.parse(JSON.stringify(json));
  normalizeTexturelessBlendMaterials(nextJson);
  nextJson.meshes = meshes.filter((_, index) => keepMesh.has(index));
  nextJson.__meshMap = keepMesh;
  remapNodeReferences(nextJson, nodeMap, dropNodes);
  delete nextJson.__meshMap;

  return {
    buffer: writeGlb(nextJson, chunks),
    changed: true,
    removedMeshNames,
    removedNodeNames,
  };
}

export function cleanGlbFile(filePath) {
  const original = fs.readFileSync(filePath);
  const result = stripUnsupportedGlb(original);
  if (result.changed) fs.writeFileSync(filePath, result.buffer);
  return result;
}
