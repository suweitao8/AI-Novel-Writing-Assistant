const path = require("node:path");

const DEFAULT_MANAGED_ROOT = "D:/UnrealWorkspace/Cine57-exported";

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function getAnimationImportRunLayout(
  managedRoot = DEFAULT_MANAGED_ROOT,
  runId,
) {
  if (!runId || !/^[a-z0-9][a-z0-9-]*$/.test(runId)) {
    throw new Error(`动画导入 run-id 只能使用小写字母、数字和连字符：${runId}`);
  }

  const root = path.resolve(managedRoot);
  const runDir = path.join(root, "runs", runId);
  return {
    managedRoot: toPosixPath(root),
    runId,
    runDir: toPosixPath(runDir),
    directories: {
      fbx: toPosixPath(path.join(runDir, "fbx")),
      glb: toPosixPath(path.join(runDir, "glb")),
      retarget: toPosixPath(path.join(runDir, "glb", "retarget")),
      final: toPosixPath(path.join(runDir, "final")),
      logs: toPosixPath(path.join(runDir, "logs")),
      backups: toPosixPath(path.join(runDir, "backups")),
    },
    files: {
      runManifest: toPosixPath(path.join(runDir, "run-manifest.json")),
      ueExportLog: toPosixPath(path.join(runDir, "logs", "ue-export.log")),
      ueExportConsoleLog: toPosixPath(path.join(runDir, "logs", "ue-export.console.log")),
      assemblyLog: toPosixPath(path.join(runDir, "logs", "assembly.log")),
      stagedSelection: toPosixPath(path.join(runDir, "final", "animationCatalogSelection.json")),
      stagedEntries: toPosixPath(path.join(runDir, "final", "animationCatalogEntries.ts")),
    },
  };
}

function isInside(parent, candidate) {
  const parentPath = path.resolve(parent);
  const candidatePath = path.resolve(candidate);
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertInsideRun(layout, candidate) {
  if (!isInside(layout.runDir, candidate)) {
    throw new Error(`路径必须位于当前动画导入运行目录内：${candidate}`);
  }
  return candidate;
}

module.exports = {
  DEFAULT_MANAGED_ROOT,
  assertInsideRun,
  getAnimationImportRunLayout,
  isInside,
};
