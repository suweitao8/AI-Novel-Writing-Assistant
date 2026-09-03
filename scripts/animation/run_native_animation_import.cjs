const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  DEFAULT_MANAGED_ROOT,
  getAnimationImportRunLayout,
  isInside,
} = require("./animationImportLayout.cjs");

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PROJECT = "D:/UnrealWorkspace/Anim57/Anim57.uproject";
const DEFAULT_UNREAL_EDITOR = "D:/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe";
const DEFAULT_RUN_ID = "20260903-anim57-ue5-native-unarmed-attack";
const SOURCE_ROOT = "/Game/Characters/Mannequins/Anims/Unarmed/Attack";
const BASE_POSE_SOURCE = "/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle";
const EXPECTED_SKELETON = "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin";

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

function runCommand(command, args, logPath, cwd = REPO_ROOT, envOverrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...envOverrides },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
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
  if (selection.target !== "UE5-native") {
    throw new Error(`本次验证要求 target=UE5-native，实际为：${selection.target}`);
  }
  if (selection.sourceProject !== "Anim57") {
    throw new Error(`本次验证要求 sourceProject=Anim57，实际为：${selection.sourceProject}`);
  }
  if (selection.sourceAssetRoot !== SOURCE_ROOT) {
    throw new Error(`源动画目录不匹配：${selection.sourceAssetRoot}`);
  }
  if (!Array.isArray(selection.clips) || selection.clips.length !== 4) {
    throw new Error(`本次验证必须恰好有 4 条动画，实际为：${selection.clips?.length ?? 0}`);
  }
  const basePose = selection.nativeBasePose;
  if (!basePose || basePose.clipName !== "standing" || basePose.sourceAssetPath !== BASE_POSE_SOURCE) {
    throw new Error(`本次验证必须使用指定的 UE5 原生待机资源：${BASE_POSE_SOURCE}`);
  }
  if (basePose.sourceSkeleton !== EXPECTED_SKELETON) {
    throw new Error(`基础待机动作的清单骨架不匹配：${basePose.sourceSkeleton}`);
  }
  const projectContent = path.join(path.dirname(projectPath), "Content");
  const sourceAssets = [basePose, ...selection.clips];
  for (const clip of sourceAssets) {
    if (clip.sourceSkeleton !== EXPECTED_SKELETON) {
      throw new Error(`动画 ${clip.id} 的清单骨架不匹配：${clip.sourceSkeleton}`);
    }
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

function backupIfPresent(filePath, backupPath, manifest, key) {
  if (!fs.existsSync(filePath)) return;
  fs.copyFileSync(filePath, backupPath);
  manifest[key] = {
    path: backupPath,
    bytes: fs.statSync(backupPath).size,
    sha256: sha256(backupPath),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectionPath = nativePath(options.selection ?? path.join(__dirname, "animationCatalogSelection.json"));
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  const sourceAssets = [selection.nativeBasePose, ...selection.clips];
  const projectPath = nativePath(options.project ?? selection.sourceProjectPath ?? DEFAULT_PROJECT);
  const managedRoot = options.managedRoot ?? DEFAULT_MANAGED_ROOT;
  const runId = options.runId ?? DEFAULT_RUN_ID;
  const layout = getAnimationImportRunLayout(managedRoot, runId);
  const runDir = nativePath(layout.runDir);
  const stagedSelection = nativePath(layout.files.stagedSelection);
  const stagedEntries = nativePath(layout.files.stagedEntries);
  const outputManny = nativePath(options.outputManny ?? path.join(REPO_ROOT, "client/public/anims/ue5/UE5_Manny_Animations.glb"));
  const outputQuinn = nativePath(options.outputQuinn ?? path.join(REPO_ROOT, "client/public/anims/ue5/UE5_Quinn_Animations.glb"));
  const unrealEditor = nativePath(options.unrealEditor ?? DEFAULT_UNREAL_EDITOR);
  const exportScript = nativePath(options.exportScript ?? path.join(__dirname, "export_ue5_native_character_assets.py"));
  const assembleScript = nativePath(options.assembleScript ?? path.join(__dirname, "assemble_ue5_native_animation_catalog.py"));
  const generateScript = nativePath(options.generateScript ?? path.join(__dirname, "generate_animation_catalog_entries.cjs"));
  const verifyScript = nativePath(options.verifyScript ?? path.join(__dirname, "verify_animation_catalog.cjs"));

  ensureFile(selectionPath, "动画清单");
  ensureFile(projectPath, "源工程");
  ensureFile(unrealEditor, "UnrealEditor-Cmd");
  ensureFile(exportScript, "UE5 原生导出脚本");
  ensureFile(assembleScript, "UE5 原生组装脚本");
  ensureFile(generateScript, "前端目录生成脚本");
  ensureFile(verifyScript, "目录门禁脚本");
  assertSelection(selection, projectPath);
  assertProjectNotOpen(projectPath);

  if (fs.existsSync(runDir) && !options.reuse) {
    throw new Error(`运行目录已存在，为避免覆盖请换一个 --run-id 或显式使用 --reuse：${runDir}`);
  }
  for (const directory of Object.values(layout.directories)) fs.mkdirSync(nativePath(directory), { recursive: true });
  fs.copyFileSync(selectionPath, nativePath(path.join(layout.directories.backups, "animationCatalogSelection.before-native.json")));
  fs.copyFileSync(selectionPath, stagedSelection);

  const manifest = {
    schemaVersion: 1,
    status: "running",
    pipeline: "ue5-native-no-retarget",
    runId,
    managedRoot: layout.managedRoot,
    runDir: layout.runDir,
    sourceProject: selection.sourceProject,
    sourceProjectPath: projectPath,
    sourceAssetRoot: selection.sourceAssetRoot,
    selectedAssets: sourceAssets.map((clip) => clip.sourceAssetPath),
    profiles: ["manny", "quinn"],
    directories: layout.directories,
    files: layout.files,
    outputs: { manny: outputManny, quinn: outputQuinn },
  };
  writeJson(nativePath(layout.files.runManifest), manifest);
  activeRunManifest = { path: nativePath(layout.files.runManifest), manifest };

  let projectState = null;
  try {
    backupIfPresent(
      outputManny,
      nativePath(path.join(layout.directories.backups, "UE5_Manny_Animations.before-native.glb")),
      manifest,
      "previousMannyOutputBackup",
    );
    backupIfPresent(
      outputQuinn,
      nativePath(path.join(layout.directories.backups, "UE5_Quinn_Animations.before-native.glb")),
      manifest,
      "previousQuinnOutputBackup",
    );
    const entriesPath = path.join(REPO_ROOT, "client/src/config/animationCatalogEntries.ts");
    backupIfPresent(
      entriesPath,
      nativePath(path.join(layout.directories.backups, "animationCatalogEntries.before-native.ts")),
      manifest,
      "previousEntriesBackup",
    );
    const projectBackupPath = nativePath(path.join(
      layout.directories.backups,
      `${path.basename(projectPath, ".uproject")}.before-native-python-plugin.uproject`,
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
        CINE57_ANIMATION_NATIVE_OUTPUT_DIR: nativePath(layout.directories.native),
      },
    );
  } finally {
    restoreProject(projectPath, projectState);
  }

  ensureFile(nativePath(layout.files.nativeExportManifest), "UE5 原生导出清单");
  runCommand(
    process.env.PYTHON ?? "python",
    [
      assembleScript,
      "--selection", stagedSelection,
      "--native-export-manifest", nativePath(layout.files.nativeExportManifest),
      "--native-dir", nativePath(layout.directories.native),
      "--output-manny", nativePath(layout.files.stagedManny),
      "--output-quinn", nativePath(layout.files.stagedQuinn),
    ],
    nativePath(layout.files.assemblyLog),
  );
  ensureFile(nativePath(layout.files.nativeAssemblyManifest), "UE5 原生组装清单");
  runCommand(
    process.execPath,
    [generateScript, stagedSelection, stagedEntries],
    nativePath(path.join(layout.directories.logs, "catalog-generation.log")),
  );
  runCommand(
    process.execPath,
    [verifyScript, stagedSelection, nativePath(layout.files.stagedManny)],
    nativePath(path.join(layout.directories.logs, "verify-manny.log")),
  );
  runCommand(
    process.execPath,
    [verifyScript, stagedSelection, nativePath(layout.files.stagedQuinn)],
    nativePath(path.join(layout.directories.logs, "verify-quinn.log")),
  );

  fs.copyFileSync(stagedSelection, selectionPath);
  fs.copyFileSync(stagedEntries, path.join(REPO_ROOT, "client/src/config/animationCatalogEntries.ts"));
  fs.mkdirSync(path.dirname(outputManny), { recursive: true });
  fs.mkdirSync(path.dirname(outputQuinn), { recursive: true });
  fs.copyFileSync(nativePath(layout.files.stagedManny), outputManny);
  fs.copyFileSync(nativePath(layout.files.stagedQuinn), outputQuinn);

  manifest.status = "passed";
  manifest.outputs = {
    manny: { path: outputManny, bytes: fs.statSync(outputManny).size, sha256: sha256(outputManny) },
    quinn: { path: outputQuinn, bytes: fs.statSync(outputQuinn).size, sha256: sha256(outputQuinn) },
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
