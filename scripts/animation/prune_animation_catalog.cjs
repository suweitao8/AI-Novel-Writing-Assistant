const fs = require("node:fs");
const path = require("node:path");

function readGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`不是 GLB：${filePath}`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buffer.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"));
  const binaryHeader = jsonStart + jsonLength;
  if (buffer.toString("ascii", binaryHeader + 4, binaryHeader + 8) !== "BIN\0") {
    throw new Error(`GLB 缺少 BIN chunk：${filePath}`);
  }
  const binaryLength = buffer.readUInt32LE(binaryHeader);
  const binaryStart = binaryHeader + 8;
  return {
    json,
    binary: buffer.subarray(binaryStart, binaryStart + binaryLength),
  };
}

function writeGlb(filePath, json, binary) {
  const paddedBinary = Buffer.concat([
    binary,
    Buffer.alloc((4 - (binary.length % 4)) % 4),
  ]);
  const outputJson = { ...json, buffers: [...(json.buffers ?? [{ byteLength: 0 }])] };
  outputJson.buffers[0] = {
    ...outputJson.buffers[0],
    byteLength: paddedBinary.length,
  };
  const jsonBuffer = Buffer.from(JSON.stringify(outputJson), "utf8");
  const paddedJson = Buffer.concat([
    jsonBuffer,
    Buffer.from(" ".repeat((4 - (jsonBuffer.length % 4)) % 4), "utf8"),
  ]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([
    header,
    jsonHeader,
    paddedJson,
    binaryHeader,
    paddedBinary,
  ]));
}

function collectBufferViewRefs(value, usedBufferViewIndices) {
  if (Array.isArray(value)) {
    for (const item of value) collectBufferViewRefs(item, usedBufferViewIndices);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "bufferView" && Number.isInteger(child)) {
      usedBufferViewIndices.add(child);
    } else {
      collectBufferViewRefs(child, usedBufferViewIndices);
    }
  }
}

function remapBufferViewRefs(value, bufferViewMap) {
  if (Array.isArray(value)) {
    return value.map((item) => remapBufferViewRefs(item, bufferViewMap));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "bufferView" && Number.isInteger(child)
        ? bufferViewMap.get(child)
        : remapBufferViewRefs(child, bufferViewMap),
    ]),
  );
}

function remapAccessorReference(value, accessorMap, label) {
  if (!Number.isInteger(value) || !accessorMap.has(value)) {
    throw new Error(`GLB ${label} 引用了未保留的 accessor：${value}`);
  }
  return accessorMap.get(value);
}

function compactAnimationData(json, binary, keptAnimations) {
  const usedAccessorIndices = new Set();
  const usedBufferViewIndices = new Set();
  const addAccessor = (value, label) => {
    usedAccessorIndices.add(remapAccessorReference(value, new Map(
      (json.accessors ?? []).map((_accessor, index) => [index, index]),
    ), label));
  };

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.indices !== undefined) addAccessor(primitive.indices, "mesh indices");
      for (const accessorIndex of Object.values(primitive.attributes ?? {})) {
        addAccessor(accessorIndex, "mesh attribute");
      }
      for (const target of primitive.targets ?? []) {
        for (const accessorIndex of Object.values(target ?? {})) {
          addAccessor(accessorIndex, "mesh morph target");
        }
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) {
      addAccessor(skin.inverseBindMatrices, "skin inverseBindMatrices");
    }
  }
  for (const animation of keptAnimations) {
    for (const sampler of animation.samplers ?? []) {
      addAccessor(sampler.input, "animation input");
      addAccessor(sampler.output, "animation output");
    }
  }
  collectBufferViewRefs(json.meshes ?? [], usedBufferViewIndices);
  collectBufferViewRefs(json.images ?? [], usedBufferViewIndices);
  collectBufferViewRefs(json.extensions ?? {}, usedBufferViewIndices);

  const visitAccessor = (accessorIndex) => {
    const accessor = json.accessors?.[accessorIndex];
    if (!accessor) throw new Error(`GLB 缺少 accessor：${accessorIndex}`);
    if (Number.isInteger(accessor.bufferView)) usedBufferViewIndices.add(accessor.bufferView);
    if (accessor.sparse) {
      if (Number.isInteger(accessor.sparse.indices?.bufferView)) {
        usedBufferViewIndices.add(accessor.sparse.indices.bufferView);
      }
      if (Number.isInteger(accessor.sparse.values?.bufferView)) {
        usedBufferViewIndices.add(accessor.sparse.values.bufferView);
      }
    }
  };
  for (const accessorIndex of usedAccessorIndices) visitAccessor(accessorIndex);

  const sortedAccessors = [...usedAccessorIndices].sort((left, right) => left - right);
  const sortedBufferViews = [...usedBufferViewIndices].sort((left, right) => left - right);
  const accessorMap = new Map(sortedAccessors.map((index, outputIndex) => [index, outputIndex]));
  const bufferViewMap = new Map(sortedBufferViews.map((index, outputIndex) => [index, outputIndex]));
  const compactBinaryParts = [];
  let binaryLength = 0;
  const compactBufferViews = sortedBufferViews.map((viewIndex) => {
    const view = json.bufferViews?.[viewIndex];
    if (!view) throw new Error(`GLB 缺少 bufferView：${viewIndex}`);
    const sourceStart = view.byteOffset ?? 0;
    const sourceEnd = sourceStart + view.byteLength;
    const viewData = binary.subarray(sourceStart, sourceEnd);
    if (viewData.length !== view.byteLength) {
      throw new Error(`GLB bufferView 数据不完整：${viewIndex}`);
    }
    const alignedOffset = (binaryLength + 3) & ~3;
    if (alignedOffset > binaryLength) compactBinaryParts.push(Buffer.alloc(alignedOffset - binaryLength));
    compactBinaryParts.push(viewData);
    binaryLength = alignedOffset + viewData.length;
    return {
      ...view,
      buffer: 0,
      byteOffset: alignedOffset,
    };
  });

  const outputJson = JSON.parse(JSON.stringify(json));
  outputJson.animations = keptAnimations;
  outputJson.accessors = sortedAccessors.map((accessorIndex) => {
    const accessor = { ...json.accessors[accessorIndex] };
    if (Number.isInteger(accessor.bufferView)) {
      accessor.bufferView = bufferViewMap.get(accessor.bufferView);
    }
    if (accessor.sparse) {
      accessor.sparse = {
        ...accessor.sparse,
        indices: accessor.sparse.indices
          ? { ...accessor.sparse.indices, bufferView: bufferViewMap.get(accessor.sparse.indices.bufferView) }
          : accessor.sparse.indices,
        values: accessor.sparse.values
          ? { ...accessor.sparse.values, bufferView: bufferViewMap.get(accessor.sparse.values.bufferView) }
          : accessor.sparse.values,
      };
    }
    return accessor;
  });
  outputJson.bufferViews = compactBufferViews;
  outputJson.buffers = [...(json.buffers ?? [{ byteLength: 0 }])];
  outputJson.buffers[0] = { ...outputJson.buffers[0], byteLength: binaryLength };
  outputJson.meshes = (json.meshes ?? []).map((mesh) => ({
    ...mesh,
    primitives: (mesh.primitives ?? []).map((primitive) => ({
      ...primitive,
      indices: primitive.indices === undefined
        ? primitive.indices
        : accessorMap.get(primitive.indices),
      attributes: Object.fromEntries(
        Object.entries(primitive.attributes ?? {}).map(([key, index]) => [key, accessorMap.get(index)]),
      ),
      ...(primitive.targets === undefined
        ? {}
        : {
            targets: primitive.targets.map((target) => Object.fromEntries(
              Object.entries(target ?? {}).map(([key, index]) => [key, accessorMap.get(index)]),
            )),
          }),
      extensions: remapBufferViewRefs(primitive.extensions, bufferViewMap),
    })),
    extensions: remapBufferViewRefs(mesh.extensions, bufferViewMap),
  }));
  outputJson.skins = (json.skins ?? []).map((skin) => ({
    ...skin,
    inverseBindMatrices: skin.inverseBindMatrices === undefined
      ? skin.inverseBindMatrices
      : accessorMap.get(skin.inverseBindMatrices),
  }));
  outputJson.animations = keptAnimations.map((animation) => ({
    ...animation,
    samplers: (animation.samplers ?? []).map((sampler) => ({
      ...sampler,
      input: accessorMap.get(sampler.input),
      output: accessorMap.get(sampler.output),
    })),
  }));
  outputJson.images = (json.images ?? []).map((image) => remapBufferViewRefs(image, bufferViewMap));
  outputJson.extensions = remapBufferViewRefs(json.extensions, bufferViewMap);
  return {
    json: outputJson,
    binary: Buffer.concat(compactBinaryParts),
  };
}

function pruneAnimations(inputPath, outputPath, predicate) {
  const { json, binary } = readGlb(inputPath);
  const animations = json.animations ?? [];
  const keptAnimations = animations.filter(predicate);
  if (keptAnimations.length === 0) {
    throw new Error(`剪枝后没有剩余动画：${inputPath}`);
  }
  const compacted = compactAnimationData(json, binary, keptAnimations);
  writeGlb(outputPath, compacted.json, compacted.binary);
  return {
    inputPath,
    outputPath,
    originalAnimationCount: animations.length,
    keptAnimationCount: keptAnimations.length,
    removedAnimationCount: animations.length - keptAnimations.length,
    originalBytes: binary.length,
    compactedBytes: compacted.binary.length,
    keptAnimationNames: keptAnimations.map((animation) => animation.name),
  };
}

function main() {
  const [inputPath, outputPath, dropPrefix = "C57_"] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("usage: node prune_animation_catalog.cjs <input.glb> <output.glb> [drop-prefix]");
  }
  const result = pruneAnimations(
    path.resolve(inputPath),
    path.resolve(outputPath),
    (animation) => !String(animation.name ?? "").startsWith(dropPrefix),
  );
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = {
  compactAnimationData,
  pruneAnimations,
  readGlb,
  writeGlb,
};
