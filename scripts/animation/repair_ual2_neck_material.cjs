const fs = require("node:fs");
const path = require("node:path");

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const TRIANGLES_MODE = 4;
const ELEMENT_ARRAY_BUFFER_TARGET = 34963;
const FLOAT_COMPONENT = 5126;
const UNSIGNED_BYTE_COMPONENT = 5121;
const UNSIGNED_SHORT_COMPONENT = 5123;
const UNSIGNED_INT_COMPONENT = 5125;

const UAL2_SIGNATURE = Object.freeze({
  meshName: "Mannequin",
  mainMaterialName: "M_Main",
  jointMaterialName: "M_Joints",
  mainVertexCount: 3389,
  mainIndexCount: 17196,
  jointIndexCount: 24036,
  boneCount: 65,
});

// UAL2 Mannequin 的外层颈部跨越约 1.45–1.63 米高度，外轮廓半径约为 0.22 米；
// 只取更窄的内侧带会在侧面和背面漏出 M_Main，形成不连续的浅蓝色环带。
const DEFAULT_NECK_SELECTION = Object.freeze({
  minY: 1.45,
  maxY: 1.63,
  maxRadial: 0.22,
  maxAbsX: 0.22,
  angularBins: 16,
  boundaryFraction: 0.1,
});

function fail(message) {
  throw new Error(message);
}

function align4(value) {
  return (value + 3) & ~3;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseGlb(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    fail("输入不是 GLB 文件。");
  }
  if (buffer.readUInt32LE(4) !== GLB_VERSION) {
    fail("只支持 glTF 2.0 GLB 文件。");
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    fail("GLB 文件长度字段与实际长度不一致。");
  }

  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail("GLB chunk header 不完整。");
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) fail("GLB chunk 超出文件边界。");
    chunks.push({ type, data: Buffer.from(buffer.subarray(start, end)) });
    offset = end;
  }
  if (offset !== buffer.length) fail("GLB chunk 对齐无效。");

  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
  const binChunk = chunks.find((chunk) => chunk.type === BIN_CHUNK);
  if (!jsonChunk) fail("GLB 缺少 JSON chunk。");
  if (!binChunk) fail("GLB 缺少 BIN chunk。");

  let json;
  try {
    json = JSON.parse(jsonChunk.data.toString("utf8").replace(/\s+$/, ""));
  } catch (error) {
    fail(
      "GLB JSON 无法解析：" +
        (error instanceof Error ? error.message : String(error)),
    );
  }

  return { json, bin: binChunk.data, chunks };
}

function readGlbAccessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) fail("缺少 accessor " + accessorIndex + "。");
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    fail("accessor " + accessorIndex + " 缺少 bufferView。");
  }
  if (bufferView.buffer !== undefined && bufferView.buffer !== 0) {
    fail("accessor " + accessorIndex + " 引用了不支持的 buffer。");
  }

  const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const componentSizes = {
    [UNSIGNED_BYTE_COMPONENT]: 1,
    [UNSIGNED_SHORT_COMPONENT]: 2,
    [UNSIGNED_INT_COMPONENT]: 4,
    [FLOAT_COMPONENT]: 4,
  };
  const componentCount = componentCounts[accessor.type];
  const componentSize = componentSizes[accessor.componentType];
  if (!componentCount || !componentSize) {
    fail("accessor " + accessorIndex + " 的类型或 componentType 不受支持。");
  }

  const elementSize = componentCount * componentSize;
  const stride = bufferView.byteStride ?? elementSize;
  if (stride < elementSize) {
    fail("accessor " + accessorIndex + " 的 byteStride 无效。");
  }
  const start =
    (bufferView.byteOffset ?? 0) +
    (accessor.byteOffset ?? 0);
  const lastByte = start + Math.max(0, accessor.count - 1) * stride + elementSize;
  if (start < 0 || lastByte > bin.length) {
    fail("accessor " + accessorIndex + " 超出 BIN 数据范围。");
  }

  const values = [];
  for (let item = 0; item < accessor.count; item += 1) {
    const itemOffset = start + item * stride;
    for (let component = 0; component < componentCount; component += 1) {
      const byteOffset = itemOffset + component * componentSize;
      if (accessor.componentType === UNSIGNED_BYTE_COMPONENT) {
        values.push(bin.readUInt8(byteOffset));
      } else if (accessor.componentType === UNSIGNED_SHORT_COMPONENT) {
        values.push(bin.readUInt16LE(byteOffset));
      } else if (accessor.componentType === UNSIGNED_INT_COMPONENT) {
        values.push(bin.readUInt32LE(byteOffset));
      } else {
        values.push(bin.readFloatLE(byteOffset));
      }
    }
  }
  return values;
}

function validateAccessor(
  gltf,
  accessorIndex,
  label,
  type,
  componentType,
  count,
) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) fail("缺少 " + label + " accessor。");
  if (accessor.type !== type || accessor.componentType !== componentType) {
    fail(label + " accessor 类型与已知 UAL2 签名不符。");
  }
  if (count !== undefined && accessor.count !== count) {
    fail(
      "accessor " +
        accessorIndex +
        " 数量与已知 UAL2 签名不符：期望 " +
        count +
        "，实际 " +
        accessor.count +
        "。",
    );
  }
}

function validateUal2Signature(gltf, options = {}) {
  const allowExisting = options.allowExisting === true;
  const materials = gltf.materials ?? [];
  const materialNames = materials.map((material) => material.name);
  const mainMaterialIndex = materialNames.indexOf(UAL2_SIGNATURE.mainMaterialName);
  const jointMaterialIndex = materialNames.indexOf(UAL2_SIGNATURE.jointMaterialName);
  const neckMaterialIndex = materialNames.indexOf("M_Neck");

  if (mainMaterialIndex < 0 || jointMaterialIndex < 0) {
    fail("GLB 缺少 M_Main 或 M_Joints，拒绝按 UAL2 资源处理。");
  }
  if (neckMaterialIndex >= 0 && !allowExisting) {
    fail("GLB 已经包含 M_Neck；默认拒绝重复修复。");
  }
  if (
    neckMaterialIndex >= 0 &&
    materialNames.filter((name) => name === "M_Neck").length !== 1
  ) {
    fail("GLB 中 M_Neck 材质数量不唯一。");
  }
  if (neckMaterialIndex >= 0) {
    return validateRepairedUal2Signature(
      gltf,
      mainMaterialIndex,
      jointMaterialIndex,
      neckMaterialIndex,
    );
  }

  const mannequinMeshes = (gltf.meshes ?? []).filter(
    (mesh) => mesh.name === UAL2_SIGNATURE.meshName,
  );
  if (mannequinMeshes.length !== 1) {
    fail("GLB 必须包含且只能包含一个名为 Mannequin 的 mesh。");
  }
  const mannequin = mannequinMeshes[0];
  if (!Array.isArray(mannequin.primitives) || mannequin.primitives.length !== 2) {
    fail("原始 UAL2 Mannequin 必须包含两个 primitive。");
  }
  const mainPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === mainMaterialIndex,
  );
  const jointPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === jointMaterialIndex,
  );
  if (!mainPrimitive || !jointPrimitive) {
    fail("Mannequin 缺少 M_Main 或 M_Joints primitive。");
  }
  if ((mainPrimitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE) {
    fail("M_Main primitive 不是三角形模式。");
  }
  if ((jointPrimitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE) {
    fail("M_Joints primitive 不是三角形模式。");
  }

  const mainPositionAccessor = mainPrimitive.attributes?.POSITION;
  const mainIndexAccessor = mainPrimitive.indices;
  const jointIndexAccessor = jointPrimitive.indices;
  validateAccessor(
    gltf,
    mainPositionAccessor,
    "M_Main POSITION",
    "VEC3",
    FLOAT_COMPONENT,
    UAL2_SIGNATURE.mainVertexCount,
  );
  validateAccessor(
    gltf,
    mainIndexAccessor,
    "M_Main index",
    "SCALAR",
    UNSIGNED_SHORT_COMPONENT,
    UAL2_SIGNATURE.mainIndexCount,
  );
  validateAccessor(
    gltf,
    jointIndexAccessor,
    "M_Joints index",
    "SCALAR",
    UNSIGNED_SHORT_COMPONENT,
    UAL2_SIGNATURE.jointIndexCount,
  );
  const jointAttributes = jointPrimitive.attributes ?? {};
  if (jointAttributes.POSITION === undefined) {
    fail("M_Joints primitive 缺少 POSITION。");
  }
  validateAccessor(
    gltf,
    jointAttributes.POSITION,
    "M_Joints POSITION",
    "VEC3",
    FLOAT_COMPONENT,
    5157,
  );

  const skin = gltf.skins?.[0];
  if (!skin || skin.joints?.length !== UAL2_SIGNATURE.boneCount) {
    fail("GLB 骨骼数量与已知 UAL2 签名不符。");
  }

  return {
    mannequin,
    mainPrimitive,
    jointPrimitive,
    mainMaterialIndex,
    jointMaterialIndex,
    mainPositionAccessor,
    mainIndexAccessor,
    jointIndexAccessor,
  };
}

function validateRepairedUal2Signature(
  gltf,
  mainMaterialIndex,
  jointMaterialIndex,
  neckMaterialIndex,
) {
  const mannequinMeshes = (gltf.meshes ?? []).filter(
    (mesh) => mesh.name === UAL2_SIGNATURE.meshName,
  );
  if (mannequinMeshes.length !== 1) {
    fail("已修复 GLB 必须包含且只能包含一个名为 Mannequin 的 mesh。");
  }
  const mannequin = mannequinMeshes[0];
  if (!Array.isArray(mannequin.primitives) || mannequin.primitives.length !== 3) {
    fail("已修复 UAL2 Mannequin 必须包含三个 primitive。");
  }
  const mainPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === mainMaterialIndex,
  );
  const jointPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === jointMaterialIndex,
  );
  const neckPrimitive = mannequin.primitives.find(
    (primitive) => primitive.material === neckMaterialIndex,
  );
  if (!mainPrimitive || !jointPrimitive || !neckPrimitive) {
    fail("已修复 Mannequin 缺少 M_Main、M_Joints 或 M_Neck primitive。");
  }
  if (
    (mainPrimitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE ||
    (jointPrimitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE ||
    (neckPrimitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE
  ) {
    fail("已修复 UAL2 primitive 不是三角形模式。");
  }

  const mainPositionAccessor = mainPrimitive.attributes?.POSITION;
  const neckPositionAccessor = neckPrimitive.attributes?.POSITION;
  if (mainPositionAccessor !== neckPositionAccessor) {
    fail("已修复 M_Main 与 M_Neck 没有复用同一套 POSITION accessor。");
  }
  validateAccessor(
    gltf,
    mainPositionAccessor,
    "已修复 M_Main POSITION",
    "VEC3",
    FLOAT_COMPONENT,
    UAL2_SIGNATURE.mainVertexCount,
  );
  const mainIndexAccessor = mainPrimitive.indices;
  const neckIndexAccessor = neckPrimitive.indices;
  validateAccessor(
    gltf,
    mainIndexAccessor,
    "已修复 M_Main index",
    "SCALAR",
    UNSIGNED_SHORT_COMPONENT,
  );
  validateAccessor(
    gltf,
    neckIndexAccessor,
    "已修复 M_Neck index",
    "SCALAR",
    UNSIGNED_SHORT_COMPONENT,
  );
  const bodyIndexCount = gltf.accessors[mainIndexAccessor].count;
  const neckIndexCount = gltf.accessors[neckIndexAccessor].count;
  if (
    bodyIndexCount <= 0 ||
    neckIndexCount <= 0 ||
    bodyIndexCount + neckIndexCount !== UAL2_SIGNATURE.mainIndexCount
  ) {
    fail("已修复 M_Main 与 M_Neck 没有覆盖原始 UAL2 三角形索引。");
  }

  const jointIndexAccessor = jointPrimitive.indices;
  validateAccessor(
    gltf,
    jointIndexAccessor,
    "M_Joints index",
    "SCALAR",
    UNSIGNED_SHORT_COMPONENT,
    UAL2_SIGNATURE.jointIndexCount,
  );
  const jointAttributes = jointPrimitive.attributes ?? {};
  if (jointAttributes.POSITION === undefined) {
    fail("M_Joints primitive 缺少 POSITION。");
  }
  validateAccessor(
    gltf,
    jointAttributes.POSITION,
    "M_Joints POSITION",
    "VEC3",
    FLOAT_COMPONENT,
    5157,
  );
  const skin = gltf.skins?.[0];
  if (!skin || skin.joints?.length !== UAL2_SIGNATURE.boneCount) {
    fail("已修复 GLB 骨骼数量与已知 UAL2 签名不符。");
  }

  return {
    mannequin,
    mainPrimitive,
    jointPrimitive,
    neckPrimitive,
    mainMaterialIndex,
    jointMaterialIndex,
    neckMaterialIndex,
    mainPositionAccessor,
    mainIndexAccessor,
    jointIndexAccessor,
    neckIndexAccessor,
    alreadyRepaired: true,
  };
}

function isNeckTriangle(vertices, selection) {
  const centroid = vertices.reduce(
    (sum, vertex) => ({
      x: sum.x + vertex.x / 3,
      y: sum.y + vertex.y / 3,
      z: sum.z + vertex.z / 3,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const inHeightBand =
    centroid.y >= selection.minY && centroid.y <= selection.maxY;
  const allInOuterNeck = vertices.every(
    (vertex) =>
      Math.hypot(vertex.x, vertex.z) <= selection.maxRadial &&
      Math.abs(vertex.x) <= selection.maxAbsX,
  );
  return { selected: inHeightBand && allInOuterNeck, centroid };
}

function getAngularBin(x, z, binCount) {
  const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(binCount - 1, Math.floor((angle / (Math.PI * 2)) * binCount));
}

function classifyNeckTriangles(positions, indices, options = {}) {
  const selection = { ...DEFAULT_NECK_SELECTION, ...options };
  if (positions.length % 3 !== 0) fail("POSITION 数据不是 VEC3。");
  if (indices.length === 0 || indices.length % 3 !== 0) {
    fail("M_Main 索引数量不是完整三角形。");
  }

  const bodyIndices = [];
  const neckIndices = [];
  const selectedTriangles = [];
  const angularBins = new Set();
  let selectedMinY = Infinity;
  let selectedMaxY = -Infinity;

  for (let index = 0; index < indices.length; index += 3) {
    const triangleIndices = indices.slice(index, index + 3);
    const vertices = triangleIndices.map((vertexIndex) => {
      if (
        !Number.isInteger(vertexIndex) ||
        vertexIndex < 0 ||
        vertexIndex >= positions.length / 3
      ) {
        fail("M_Main 索引 " + vertexIndex + " 超出 POSITION 范围。");
      }
      return {
        x: positions[vertexIndex * 3],
        y: positions[vertexIndex * 3 + 1],
        z: positions[vertexIndex * 3 + 2],
      };
    });
    const result = isNeckTriangle(vertices, selection);
    if (!result.selected) {
      bodyIndices.push(...triangleIndices);
      continue;
    }

    neckIndices.push(...triangleIndices);
    selectedTriangles.push({ indices: triangleIndices, centroid: result.centroid });
    selectedMinY = Math.min(selectedMinY, result.centroid.y);
    selectedMaxY = Math.max(selectedMaxY, result.centroid.y);
    angularBins.add(
      getAngularBin(result.centroid.x, result.centroid.z, selection.angularBins),
    );
  }

  if (neckIndices.length === 0) fail("未选出任何外层脖子三角形。");
  if (angularBins.size !== selection.angularBins) {
    fail(
      "外层脖子环向覆盖不完整：" +
        angularBins.size +
        "/" +
        selection.angularBins +
        " 个区间。",
    );
  }
  const bandHeight = selection.maxY - selection.minY;
  const boundaryDistance = bandHeight * selection.boundaryFraction;
  if (
    selectedMinY > selection.minY + boundaryDistance ||
    selectedMaxY < selection.maxY - boundaryDistance
  ) {
    fail(
      "外层脖子没有覆盖上下边界：" +
        selectedMinY.toFixed(4) +
        "-" +
        selectedMaxY.toFixed(4) +
        "。",
    );
  }

  return {
    bodyIndices,
    neckIndices,
    selectedTriangles,
    angularBins,
    selectedMinY,
    selectedMaxY,
    selection,
  };
}

function appendAligned(bin, bytes) {
  const offset = align4(bin.length);
  const padding = Buffer.alloc(offset - bin.length);
  const next = Buffer.concat([bin, padding, bytes]);
  return { bin: next, offset };
}

function encodeUnsignedShort(values) {
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      fail("索引 " + value + " 无法编码为 UNSIGNED_SHORT。");
    }
  }
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return buffer;
}

function createIndexAccessor(gltf, bin, templateAccessor, indices) {
  const bytes = encodeUnsignedShort(indices);
  const appended = appendAligned(bin, bytes);
  const bufferViewIndex = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: appended.offset,
    byteLength: bytes.length,
    target: ELEMENT_ARRAY_BUFFER_TARGET,
  });
  const accessorIndex = gltf.accessors.length;
  const template = cloneJson(templateAccessor);
  delete template.byteOffset;
  delete template.sparse;
  template.bufferView = bufferViewIndex;
  template.componentType = UNSIGNED_SHORT_COMPONENT;
  template.count = indices.length;
  template.type = "SCALAR";
  if (indices.length > 0) {
    template.min = [Math.min(...indices)];
    template.max = [Math.max(...indices)];
  }
  gltf.accessors.push(template);
  return { bin: appended.bin, accessorIndex };
}

function serializeGlb(gltf, bin, chunks) {
  gltf.buffers ??= [{}];
  gltf.buffers[0].byteLength = bin.length;
  const jsonBytes = Buffer.from(JSON.stringify(gltf), "utf8");
  const paddedJsonLength = align4(jsonBytes.length);
  const paddedJson = Buffer.concat([
    jsonBytes,
    Buffer.alloc(paddedJsonLength - jsonBytes.length, 0x20),
  ]);
  const paddedBinLength = align4(bin.length);
  const paddedBin = Buffer.concat([bin, Buffer.alloc(paddedBinLength - bin.length)]);

  const outputChunks = [];
  let hasJson = false;
  let hasBin = false;
  for (const chunk of chunks) {
    if (chunk.type === JSON_CHUNK) {
      outputChunks.push({ type: JSON_CHUNK, data: paddedJson });
      hasJson = true;
    } else if (chunk.type === BIN_CHUNK) {
      outputChunks.push({ type: BIN_CHUNK, data: paddedBin });
      hasBin = true;
    } else {
      outputChunks.push(chunk);
    }
  }
  if (!hasJson) outputChunks.unshift({ type: JSON_CHUNK, data: paddedJson });
  if (!hasBin) outputChunks.push({ type: BIN_CHUNK, data: paddedBin });

  const totalLength =
    12 +
    outputChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);
  const encodedChunks = outputChunks.map((chunk) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.writeUInt32LE(chunk.data.length, 0);
    chunkHeader.writeUInt32LE(chunk.type, 4);
    return Buffer.concat([chunkHeader, chunk.data]);
  });
  return Buffer.concat([header, ...encodedChunks]);
}

function repairUal2Glb(input, options = {}) {
  const parsed = parseGlb(input);
  const signature = validateUal2Signature(parsed.json, options);
  if (signature.alreadyRepaired) {
    return {
      buffer: Buffer.from(input),
      alreadyRepaired: true,
      classification: {
        neckIndices: [],
        angularBins: new Set(),
      },
    };
  }
  const positions = readGlbAccessor(
    parsed.json,
    parsed.bin,
    signature.mainPositionAccessor,
  );
  const indices = readGlbAccessor(
    parsed.json,
    parsed.bin,
    signature.mainIndexAccessor,
  );
  const classification = classifyNeckTriangles(
    positions,
    indices,
    options.selection,
  );

  let bin = parsed.bin;
  const bodyIndex = createIndexAccessor(
    parsed.json,
    bin,
    parsed.json.accessors[signature.mainIndexAccessor],
    classification.bodyIndices,
  );
  bin = bodyIndex.bin;
  const neckIndex = createIndexAccessor(
    parsed.json,
    bin,
    parsed.json.accessors[signature.mainIndexAccessor],
    classification.neckIndices,
  );
  bin = neckIndex.bin;

  const mannequin = signature.mannequin;
  const mainPrimitive = signature.mainPrimitive;
  mainPrimitive.indices = bodyIndex.accessorIndex;
  const neckMaterial = cloneJson(
    parsed.json.materials[signature.jointMaterialIndex],
  );
  neckMaterial.name = "M_Neck";
  const neckMaterialIndex = parsed.json.materials.length;
  parsed.json.materials.push(neckMaterial);

  const neckPrimitive = cloneJson(mainPrimitive);
  neckPrimitive.indices = neckIndex.accessorIndex;
  neckPrimitive.material = neckMaterialIndex;
  mannequin.primitives.push(neckPrimitive);

  return {
    buffer: serializeGlb(parsed.json, bin, parsed.chunks),
    classification,
    neckMaterialIndex,
    bodyIndexAccessor: bodyIndex.accessorIndex,
    neckIndexAccessor: neckIndex.accessorIndex,
  };
}

function writeOutputAtomically(outputPath, buffer) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = outputPath + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(temporaryPath, buffer);
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original error if cleanup itself is unavailable.
    }
    throw error;
  }
}

function parseCliArgs(argv) {
  const flags = new Set(argv.filter((argument) => argument.startsWith("-")));
  const positional = argv.filter((argument) => !argument.startsWith("-"));
  const inPlace = flags.has("--in-place");
  if (flags.has("--help") || flags.has("-h")) {
    return { help: true };
  }
  if (positional.length !== (inPlace ? 1 : 2)) {
    fail(
      inPlace
        ? "用法：node repair_ual2_neck_material.cjs [--in-place] <input.glb>"
        : "用法：node repair_ual2_neck_material.cjs <input.glb> <output.glb>",
    );
  }
  return {
    inputPath: path.resolve(positional[0]),
    outputPath: path.resolve(inPlace ? positional[0] : positional[1]),
    allowExisting: flags.has("--allow-existing"),
  };
}

function runCli(argv) {
  const options = parseCliArgs(argv);
  if (options.help) {
    console.log(
      "用法：node repair_ual2_neck_material.cjs [--allow-existing] [--in-place] <input.glb> [output.glb]",
    );
    return;
  }
  const input = fs.readFileSync(options.inputPath);
  const result = repairUal2Glb(input, {
    allowExisting: options.allowExisting,
  });
  writeOutputAtomically(options.outputPath, result.buffer);
  if (result.alreadyRepaired) {
    console.log("资源已经修复，未重复改写。");
    return;
  }
  console.log(
    "已生成 " +
      options.outputPath +
      "：" +
      result.classification.neckIndices.length / 3 +
      " 个脖子三角形，覆盖 " +
      result.classification.angularBins.size +
      " 个环向区间。",
  );
}

module.exports = {
  DEFAULT_NECK_SELECTION,
  UAL2_SIGNATURE,
  classifyNeckTriangles,
  parseGlb,
  readGlbAccessor,
  repairUal2Glb,
  serializeGlb,
  validateUal2Signature,
};

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      "UAL2 脖子材质修复失败：" +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  }
}
