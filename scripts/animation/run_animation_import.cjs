const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  DEFAULT_MANAGED_ROOT,
  getAnimationImportRunLayout,
  isInside,
} = require("./animationImportLayout.cjs");
const { measureRootTranslation } = require("./inPlaceAnimationPolicy.cjs");

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PROJECT = "D:/UnrealWorkspace/Anim57/Anim57.uproject";
const DEFAULT_UNREAL_EDITOR = "D:/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe";
const DEFAULT_CONVERTER = "D:/UnrealWorkspace/gltf-tools/fbx2glb.mjs";
const DEFAULT_BASE_GLTF = "D:/UnrealWorkspace/Cine57-exported/base/UAL2_AnimationBase.glb";
const DEFAULT_RUN_ID = "20260902-anim57-unarmed-attack-smoke";
let activeRunManifest = null;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`未知参数：${value}`);
    const [flag, inlineValue] = value.split("=", 2);
    const optionName = flag.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[optionName] = inlineValue;
      continue;
    }
    if (flag === "--reuse") {
      options.reuse = true;
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new Error(`参数需要值：${flag}`);
    }
    options[optionName] = argv[++index];
  }
  return options;
}

function nativePath(value) {
  return path.resolve(String(value).replaceAll("/", path.sep));
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label}不存在：${filePath}`);
  }
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error(`不是 GLB：${filePath}`);
  const jsonLength = buffer.readUInt32LE(12);
  return {
    buffer,
    json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")),
    binaryStart: 20 + jsonLength + 8,
  };
}

function readAccessorValues(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  if (!componentCount || (accessor.componentType ?? 5126) !== 5126) {
    throw new Error(`最终 GLB 使用了不支持的动画 accessor：${accessor.type}/${accessor.componentType}`);
  }
  const offset = glb.binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? componentCount * 4;
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const rowOffset = offset + index * stride;
    const row = [];
    for (let component = 0; component < componentCount; component += 1) {
      row.push(glb.buffer.readFloatLE(rowOffset + component * 4));
    }
    values.push(componentCount === 1 ? row[0] : row);
  }
  return values;
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
    if (channel.target?.path !== "translation" || !rootNodes.has(channel.target.node)) continue;
    const sampler = animation.samplers[channel.sampler];
    const output = readAccessorValues(glb, sampler.output);
    if (sampler.interpolation === "CUBICSPLINE") {
      values.push(...output.filter((_value, index) => index % 3 === 1));
    } else {
      values.push(...output);
    }
  }
  return values;
}

function animationEvidence(glbPath) {
  const glb = readGlbJson(glbPath);
  const { json } = glb;
  const durationByName = new Map();
  const frameRateByName = new Map();
  const rootMetricsByName = new Map();
  for (const animation of json.animations ?? []) {
    let duration = 0;
    const deltas = [];
    for (const sampler of animation.samplers ?? []) {
      const times = readAccessorValues(glb, sampler.input);
      for (const time of times) {
        duration = Math.max(duration, time);
      }
      for (let index = 1; index < times.length; index += 1) {
        const delta = times[index] - times[index - 1];
        if (delta > 1e-5 && Number.isFinite(delta)) deltas.push(delta);
      }
    }
    deltas.sort((left, right) => left - right);
    const middle = Math.floor(deltas.length / 2);
    const median = deltas.length === 0
      ? 24
      : deltas.length % 2 === 1
        ? deltas[middle]
        : (deltas[middle - 1] + deltas[middle]) / 2;
    durationByName.set(animation.name, Number(duration.toFixed(4)));
    frameRateByName.set(animation.name, Math.round(1 / median));
    rootMetricsByName.set(animation.name, measureRootTranslation(rootTranslationValues(glb, animation)));
  }
  return { durationByName, frameRateByName, rootMetricsByName };
}

function syncSelectionEvidence(selectionPath, exportManifestPath, stagedGlbPath) {
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  const exportManifest = JSON.parse(fs.readFileSync(exportManifestPath, "utf8"));
  const exportedById = new Map((exportManifest.exported ?? []).map((row) => [row.id, row]));
  for (const clip of selection.clips) {
    const exported = exportedById.get(clip.id);
    if (!exported) throw new Error(`导出清单缺少 ${clip.id} 的源证据`);
    if (typeof exported.sourceDurationSeconds !== "number" || exported.sourceDurationSeconds <= 0) {
      throw new Error(`导出清单缺少 ${clip.id} 的有效源动画时长`);
    }
    if (!exported.sourceSkeleton) throw new Error(`导出清单缺少 ${clip.id} 的源骨架证据`);
    clip.sourceDurationSeconds = exported.sourceDurationSeconds;
    clip.sourceSkeleton = exported.sourceSkeleton;
  }
  const skeletons = new Set(selection.clips.map((clip) => clip.sourceSkeleton).filter(Boolean));
  if (skeletons.size !== 1 || selection.clips.some((clip) => !clip.sourceSkeleton)) {
    throw new Error(`四条动画必须来自同一套源骨架，实际为 ${skeletons.size} 套且存在缺失证据`);
  }

  const { durationByName, frameRateByName, rootMetricsByName } = animationEvidence(stagedGlbPath);
  let maxRootTranslationRange = 0;
  let maxRootTranslationNet = 0;
  for (const clip of selection.clips) {
    const duration = durationByName.get(clip.clipName);
    const frameRate = frameRateByName.get(clip.clipName);
    const rootMetrics = rootMetricsByName.get(clip.clipName);
    if (duration === undefined || frameRate === undefined) {
      throw new Error(`最终 GLB 缺少 ${clip.clipName} 的时长或帧率证据`);
    }
    if (!rootMetrics) throw new Error(`最终 GLB 缺少 ${clip.clipName} 的根位移证据`);
    clip.catalogDurationSeconds = duration;
    clip.durationSeconds = duration;
    clip.frameRate = frameRate;
    clip.rootTranslationMaxRangeMeters = Number(rootMetrics.maxRange.toFixed(6));
    clip.rootTranslationMaxNetMeters = Number(rootMetrics.maxNet.toFixed(6));
    maxRootTranslationRange = Math.max(maxRootTranslationRange, rootMetrics.maxRange);
    maxRootTranslationNet = Math.max(maxRootTranslationNet, rootMetrics.maxNet);
  }
  selection.rootTranslationAudit = {
    rule: "in-place clips must stay within 0.03m; root-motion clips must preserve the exported root translation channel",
    auditedClipCount: selection.clips.length,
    rejectedClipCount: 0,
    maxRangeMeters: Number(maxRootTranslationRange.toFixed(6)),
    maxNetMeters: Number(maxRootTranslationNet.toFixed(6)),
  };
  writeJson(selectionPath, selection);
  return selection;
}

function runCommand(command, args, logPath, cwd = REPO_ROOT, envOverrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...envOverrides },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.writeFileSync(logPath, output, "utf8");
  if (result.error) throw new Error(`${command} 启动失败：${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} 退出码 ${result.status}，详情见 ${logPath}`);
  }
  return output;
}

function assertProjectNotOpen(projectPath) {
  if (process.platform !== "win32") return;
  const escaped = projectPath.replaceAll("'", "''");
  const query = [
    `$target = '${escaped}'`,
    "$processes = @(Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -match '^UnrealEditor(-Cmd)?\\.exe$' -and",
    "  $_.CommandLine -and $_.CommandLine.Contains($target)",
    "})",
    "if ($processes.Count -gt 0) { $processes | ForEach-Object { $_.ProcessId } }",
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", query], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`无法检查 Unreal Editor 占用状态：${result.error.message}`);
  if (result.status !== 0) throw new Error(`无法检查 Unreal Editor 占用状态：${result.stderr}`);
  const ids = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length > 0) {
    throw new Error(`源工程仍被 Unreal Editor 占用（PID ${ids.join(", ")}），请关闭 Anim57 后重新运行；没有修改工程。`);
  }
}

function assertSelection(selection, projectPath) {
  if (selection.sourceProject !== "Anim57") {
    throw new Error(`本次验证要求 sourceProject=Anim57，实际为：${selection.sourceProject}`);
  }
  if (selection.sourceAssetRoot !== "/Game/Characters/Mannequins/Anims/Unarmed/Attack") {
    throw new Error(`源动画目录不匹配：${selection.sourceAssetRoot}`);
  }
  if (!Array.isArray(selection.clips) || selection.clips.length !== 4) {
    throw new Error(`本次验证必须恰好有 4 条动画，实际为：${selection.clips?.length ?? 0}`);
  }
  const projectContent = path.join(path.dirname(projectPath), "Content");
  for (const clip of selection.clips) {
    const relativeAssetPath = clip.sourceAssetPath.replace(/^\/Game\//, "").replaceAll("/", path.sep);
    const sourceFile = path.join(projectContent, `${relativeAssetPath}.uasset`);
    if (!isInside(projectContent, sourceFile)) {
      throw new Error(`源资源路径越出工程 Content：${clip.sourceAssetPath}`);
    }
    ensureFile(sourceFile, `源动画资源 ${clip.sourceAssetName}`);
  }
}

function enablePythonPlugin(projectPath, backupPath) {
  const original = fs.readFileSync(projectPath);
  const project = JSON.parse(original.toString("utf8"));
  const plugins = Array.isArray(project.Plugins) ? project.Plugins : [];
  const required = ["PythonScriptPlugin", "EditorScriptingUtilities"];
  const missing = required.filter((name) => !plugins.some((plugin) => plugin?.Name === name && plugin.Enabled));
  if (missing.length === 0) return null;

  fs.copyFileSync(projectPath, backupPath);
  const state = {
    backupPath,
    originalHash: crypto.createHash("sha256").update(original).digest("hex").toUpperCase(),
  };
  try {
    for (const name of missing) plugins.push({ Name: name, Enabled: true });
    project.Plugins = plugins;
    fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  } catch (error) {
    fs.copyFileSync(backupPath, projectPath);
    throw error;
  }
  return state;
}

function restoreProject(projectPath, state) {
  if (!state) return;
  fs.copyFileSync(state.backupPath, projectPath);
  const restoredHash = sha256(projectPath);
  if (restoredHash !== state.originalHash) {
    throw new Error(`源工程恢复校验失败：${restoredHash} != ${state.originalHash}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectionPath = nativePath(options.selection ?? path.join(__dirname, "animationCatalogSelection.json"));
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  const projectPath = nativePath(options.project ?? selection.sourceProjectPath ?? DEFAULT_PROJECT);
  const managedRoot = options.managedRoot ?? DEFAULT_MANAGED_ROOT;
  const runId = options.runId ?? DEFAULT_RUN_ID;
  const layout = getAnimationImportRunLayout(managedRoot, runId);
  const runDir = nativePath(layout.runDir);
  const outputGlb = nativePath(options.outputGlb ?? path.join(REPO_ROOT, "client/public/anims/cine57/UAL2_UE_Anims.glb"));
  const stagedGlb = path.join(nativePath(layout.directories.final), "UAL2_UE_Anims.glb");
  const stagedSelection = nativePath(layout.files.stagedSelection);
  const stagedEntries = nativePath(layout.files.stagedEntries);
  const baseGlb = nativePath(options.baseGlb ?? DEFAULT_BASE_GLTF);
  const unrealEditor = nativePath(options.unrealEditor ?? DEFAULT_UNREAL_EDITOR);
  const converter = nativePath(options.converter ?? DEFAULT_CONVERTER);
  const exportScript = nativePath(options.exportScript ?? path.join(__dirname, "export_cine57_animation_catalog.py"));
  const assembleScript = nativePath(options.assembleScript ?? path.join(__dirname, "assemble_animation_catalog.py"));
  const retargetScript = nativePath(options.retargetScript ?? path.join(__dirname, "retarget_ual2.py"));
  const verifyScript = nativePath(options.verifyScript ?? path.join(__dirname, "verify_animation_catalog.cjs"));
  const generateScript = nativePath(options.generateScript ?? path.join(__dirname, "generate_animation_catalog_entries.cjs"));

  ensureFile(selectionPath, "动画清单");
  ensureFile(projectPath, "源工程");
  ensureFile(unrealEditor, "UnrealEditor-Cmd");
  ensureFile(converter, "FBX2glTF 转换脚本");
  ensureFile(baseGlb, "UAL2 基础 GLB");
  ensureFile(exportScript, "UE 导出脚本");
  ensureFile(assembleScript, "组装脚本");
  ensureFile(retargetScript, "重定向脚本");
  ensureFile(verifyScript, "目录门禁脚本");
  ensureFile(generateScript, "前端目录生成脚本");
  assertSelection(selection, projectPath);
  assertProjectNotOpen(projectPath);

  if (fs.existsSync(runDir) && !options.reuse) {
    throw new Error(`运行目录已存在，为避免覆盖请换一个 --run-id 或显式使用 --reuse：${runDir}`);
  }
  for (const directory of Object.values(layout.directories)) fs.mkdirSync(nativePath(directory), { recursive: true });
  fs.copyFileSync(selectionPath, nativePath(path.join(layout.directories.backups, "animationCatalogSelection.before.json")));
  fs.copyFileSync(selectionPath, stagedSelection);

  const manifest = {
    schemaVersion: 1,
    status: "running",
    runId,
    managedRoot: layout.managedRoot,
    runDir: layout.runDir,
    sourceProject: selection.sourceProject,
    sourceProjectPath: projectPath,
    sourceAssetRoot: selection.sourceAssetRoot,
    selectedAssets: selection.clips.map((clip) => clip.sourceAssetPath),
    directories: layout.directories,
    files: layout.files,
    outputGlb,
  };
  writeJson(nativePath(layout.files.runManifest), manifest);
  activeRunManifest = { path: nativePath(layout.files.runManifest), manifest };

  let projectState = null;
  try {
    if (fs.existsSync(outputGlb)) {
      const backupPath = nativePath(path.join(layout.directories.backups, "UAL2_UE_Anims.before-attack-smoke.glb"));
      fs.copyFileSync(outputGlb, backupPath);
      manifest.previousOutputBackup = {
        path: backupPath,
        bytes: fs.statSync(backupPath).size,
        sha256: sha256(backupPath),
      };
    }
    const entriesPath = path.join(REPO_ROOT, "client/src/config/animationCatalogEntries.ts");
    if (fs.existsSync(entriesPath)) {
      const backupPath = nativePath(path.join(layout.directories.backups, "animationCatalogEntries.before-attack-smoke.ts"));
      fs.copyFileSync(entriesPath, backupPath);
      manifest.previousEntriesBackup = {
        path: backupPath,
        bytes: fs.statSync(backupPath).size,
        sha256: sha256(backupPath),
      };
    }
    const projectBackupPath = nativePath(path.join(
      layout.directories.backups,
      `${path.basename(projectPath, ".uproject")}.before-python-plugin.uproject`,
    ));
    projectState = enablePythonPlugin(projectPath, projectBackupPath);
    if (projectState) manifest.projectTemporaryPluginBackup = projectState.backupPath;

    runCommand(
      unrealEditor,
      [
            projectPath,
            "-run=pythonscript",
            `-script=${exportScript}`,
            "-unattended",
            "-nop4",
        "-nullrhi",
        "-nosplash",
        "-nosound",
        "-stdout",
        "-FullStdOutLogOutput",
        `-abslog=${nativePath(layout.files.ueExportLog)}`,
          ],
          nativePath(layout.files.ueExportConsoleLog),
          REPO_ROOT,
          {
            CINE57_ANIMATION_SELECTION: stagedSelection,
            CINE57_ANIMATION_OUTPUT_DIR: nativePath(layout.directories.fbx),
          },
        );
  } finally {
    restoreProject(projectPath, projectState);
  }

  const exportManifestPath = path.join(nativePath(layout.directories.fbx), "export_manifest.json");
  ensureFile(exportManifestPath, "UE 导出证据清单");
  runCommand(
    process.env.PYTHON ?? "python",
    [
      assembleScript,
      "--selection", stagedSelection,
      "--fbx-dir", nativePath(layout.directories.fbx),
      "--glb-dir", nativePath(layout.directories.glb),
      "--base-glb", baseGlb,
      "--retarget-script", retargetScript,
      "--converter", converter,
      "--output-glb", stagedGlb,
    ],
    nativePath(layout.files.assemblyLog),
  );
  syncSelectionEvidence(stagedSelection, exportManifestPath, stagedGlb);
  runCommand(
    process.execPath,
    [generateScript, stagedSelection, stagedEntries],
    nativePath(path.join(layout.directories.logs, "catalog-generation.log")),
  );
  runCommand(
    process.execPath,
    [verifyScript, stagedSelection, stagedGlb],
    nativePath(path.join(layout.directories.logs, "verify.log")),
  );
  fs.copyFileSync(stagedSelection, selectionPath);
  fs.copyFileSync(stagedEntries, path.join(REPO_ROOT, "client/src/config/animationCatalogEntries.ts"));
  fs.copyFileSync(stagedGlb, outputGlb);

  manifest.status = "passed";
  manifest.output = {
    path: outputGlb,
    bytes: fs.statSync(outputGlb).size,
    sha256: sha256(outputGlb),
  };
  writeJson(nativePath(layout.files.runManifest), manifest);
  console.log(JSON.stringify(manifest, null, 2));
}

try {
  main();
} catch (error) {
  if (activeRunManifest) {
    activeRunManifest.manifest.status = "failed";
    activeRunManifest.manifest.error = error instanceof Error ? error.message : String(error);
    try {
      writeJson(activeRunManifest.path, activeRunManifest.manifest);
    } catch {
      // Preserve the original pipeline error when a failure manifest cannot be written.
    }
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
