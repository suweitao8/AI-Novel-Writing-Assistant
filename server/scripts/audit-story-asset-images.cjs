#!/usr/bin/env node

const crypto = require("node:crypto");
const { constants } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const { prisma } = require("../dist/db/prisma.js");
const { resolveGeneratedImagesRoot } = require("../dist/runtime/appPaths.js");
const {
  StoryAssetImageArtifactStore,
} = require("../dist/modules/novel/story-settings/application/StoryAssetImageArtifactStore.js");
const {
  buildStoryAssetImageAuditReport,
  scanLegacyStateImageFiles,
} = require("../dist/modules/novel/story-settings/application/StoryAssetImageAudit.js");
const { stateImageUrl } = require("../dist/modules/novel/story-settings/application/StoryAssetStateImageStorage.js");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

function checkBackup(filePath, label) {
  return fs.stat(filePath).then(async (stat) => {
    if (stat.isFile() && stat.size > 0) {
      return { filePath, byteSize: stat.size };
    }
    if (stat.isDirectory() && (await fs.readdir(filePath)).length > 0) {
      return { filePath, byteSize: null, directory: true };
    }
    throw new Error(`${label} 不存在或为空：${filePath}`);
  });
}

function parseStates(statesJson) {
  if (!statesJson?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(statesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readAssetRows() {
  const [characters, scenes, props] = await Promise.all([
    prisma.character.findMany({ select: { id: true, novelId: true, statesJson: true } }),
    prisma.novelScene.findMany({ select: { id: true, novelId: true, statesJson: true } }),
    prisma.novelProp.findMany({ select: { id: true, novelId: true, statesJson: true } }),
  ]);
  const rows = [];
  for (const [kind, assets] of [["character", characters], ["scene", scenes], ["prop", props]]) {
    for (const asset of assets) {
      for (const state of parseStates(asset.statesJson)) {
        if (!state?.id || !state.image) continue;
        rows.push({
          novelId: asset.novelId,
          kind,
          assetId: asset.id,
          stateId: state.id,
          imageStatus: state.image.status,
          artifactId: state.image.artifactId || null,
          generatedAt: state.image.generatedAt || null,
          statesJson: asset.statesJson,
        });
      }
    }
  }
  return rows;
}

function migrationGenerationId(file) {
  const source = `${file.filePath}\0${file.sha256 || ""}`;
  return `legacy-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 40)}`;
}

function migrationArtifactId(action, storageKey) {
  const source = [
    action.asset.novelId,
    action.asset.kind,
    action.asset.assetId,
    action.asset.stateId,
    storageKey,
  ].join("\0");
  return `artifact_legacy_${crypto.createHash("sha256").update(source).digest("hex").slice(0, 40)}`;
}

async function validateArtifactPointer(row, artifact, store) {
  if (!artifact
    || artifact.status !== "committed"
    || artifact.novelId !== row.novelId
    || artifact.kind !== row.kind
    || artifact.assetId !== row.assetId
    || artifact.stateId !== row.stateId) {
    return false;
  }
  try {
    const finalPath = store.resolveStorageKeyPath(artifact.storageKey);
    const verification = await store.verifyCurrentArtifact({
      storageKey: artifact.storageKey,
      finalPath,
      sha256: artifact.sha256,
      byteSize: artifact.byteSize,
      mimeType: artifact.mimeType,
      extension: artifact.extension,
    });
    return verification.valid;
  } catch {
    return false;
  }
}

async function attachArtifactValidity(rows, store) {
  const artifactIds = [...new Set(rows.map((row) => row.artifactId).filter(Boolean))];
  if (artifactIds.length === 0) return rows;
  const artifacts = await prisma.storyAssetImageArtifact.findMany({
    where: { id: { in: artifactIds } },
  });
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  return Promise.all(rows.map(async (row) => row.artifactId
    ? { ...row, artifactValid: await validateArtifactPointer(row, byId.get(row.artifactId), store) }
    : row));
}

function modelFor(tx, kind) {
  if (kind === "character") return tx.character;
  if (kind === "scene") return tx.novelScene;
  return tx.novelProp;
}

function patchStatesJson(raw, action, newArtifactId) {
  const states = parseStates(raw);
  let found = false;
  const next = states.map((state) => {
    if (state.id !== action.asset.stateId) return state;
    found = true;
    return {
      ...state,
      image: {
        ...state.image,
        artifactId: newArtifactId,
        url: stateImageUrl(action.asset.novelId, action.asset.kind, action.asset.assetId, action.asset.stateId),
      },
    };
  });
  if (!found) throw new Error(`状态在迁移前消失：${action.asset.assetId}/${action.asset.stateId}`);
  return JSON.stringify(next);
}

function patchStateAsMissing(raw, action, errorMessage) {
  const states = parseStates(raw);
  let found = false;
  const next = states.map((state) => {
    if (state.id !== action.asset.stateId) return state;
    found = true;
    const { url, artifactId, ...imageWithoutPointer } = state.image || {};
    return {
      ...state,
      image: {
        ...imageWithoutPointer,
        status: "error",
        error: errorMessage,
      },
    };
  });
  if (!found) throw new Error(`状态在标记缺失前消失：${action.asset.assetId}/${action.asset.stateId}`);
  return JSON.stringify(next);
}

function patchAmbiguousState(raw, action) {
  return patchStateAsMissing(raw, action, "旧状态图存在多个资产归属，已标记为缺失，请重新生成。");
}

async function applyMigration(action, store) {
  const assetModel = modelFor(prisma, action.asset.kind);
  const currentRow = await assetModel.findUnique({
    where: { id: action.asset.assetId },
    select: { statesJson: true },
  });
  const currentState = parseStates(currentRow?.statesJson).find((state) => state.id === action.asset.stateId);
  if (currentState?.image?.artifactId) {
    return { skipped: true, reason: "状态已在 dry-run 后完成制品迁移" };
  }
  if (!currentRow?.statesJson || !currentState) {
    throw new Error(`状态在迁移前不存在：${action.asset.assetId}/${action.asset.stateId}`);
  }

  // generation id 由 legacy 文件内容稳定派生：DB 事务失败后重跑会复用同一
  // final key，绝不会因为随机目录不断复制出新的孤儿文件，也不会覆盖既有文件。
  const artifactGenerationId = migrationGenerationId(action.file);
  const location = store.buildLocation({
    novelId: action.asset.novelId,
    kind: action.asset.kind,
    assetId: action.asset.assetId,
    stateId: action.asset.stateId,
    generationId: artifactGenerationId,
    extension: action.file.extension,
  });
  await fs.mkdir(path.dirname(location.finalPath), { recursive: true });
  try {
    await fs.copyFile(action.file.filePath, location.finalPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const verified = await store.verifyCurrentArtifact({
    storageKey: location.storageKey,
    finalPath: location.finalPath,
    sha256: action.file.sha256,
    byteSize: action.file.byteSize,
    mimeType: action.file.mimeType,
    extension: action.file.extension,
  });
  if (!verified.valid) {
    throw new Error(`迁移文件校验失败：${location.storageKey}`);
  }

  const existingArtifact = await prisma.storyAssetImageArtifact.findUnique({
    where: { storageKey: location.storageKey },
  });
  if (existingArtifact && (
    existingArtifact.novelId !== action.asset.novelId
    || existingArtifact.kind !== action.asset.kind
    || existingArtifact.assetId !== action.asset.assetId
    || existingArtifact.stateId !== action.asset.stateId
  )) {
    throw new Error(`迁移制品路径已被其他资产占用：${location.storageKey}`);
  }
  const nextArtifactId = existingArtifact?.id ?? migrationArtifactId(action, location.storageKey);
  const nextRaw = patchStatesJson(currentRow.statesJson, action, nextArtifactId);
  await prisma.$transaction(async (tx) => {
    if (existingArtifact) {
      const updated = await tx.storyAssetImageArtifact.updateMany({
        where: {
          id: existingArtifact.id,
          storageKey: location.storageKey,
          novelId: action.asset.novelId,
          kind: action.asset.kind,
          assetId: action.asset.assetId,
          stateId: action.asset.stateId,
        },
        data: {
          generationId: artifactGenerationId,
          status: "committed",
          version: 1,
          mimeType: verified.mimeType,
          extension: verified.extension,
          sha256: verified.sha256,
          byteSize: verified.byteSize,
        },
      });
      if (updated.count !== 1) {
        throw new Error(`迁移制品归属在重试期间发生变化：${location.storageKey}`);
      }
    } else {
      await tx.storyAssetImageArtifact.create({
        data: {
          id: nextArtifactId,
          novelId: action.asset.novelId,
          kind: action.asset.kind,
          assetId: action.asset.assetId,
          stateId: action.asset.stateId,
          generationId: artifactGenerationId,
          storageKey: location.storageKey,
          status: "committed",
          version: 1,
          mimeType: verified.mimeType,
          extension: verified.extension,
          sha256: verified.sha256,
          byteSize: verified.byteSize,
        },
      });
    }
    const result = await modelFor(tx, action.asset.kind).updateMany({
      where: { id: action.asset.assetId, statesJson: currentRow.statesJson },
      data: { statesJson: nextRaw },
    });
    if (result.count !== 1) {
      throw new Error(`资产在迁移期间发生并发更新：${action.asset.assetId}`);
    }
  });
  return { artifactId: nextArtifactId, storageKey: location.storageKey };
}

async function markAmbiguousAsMissing(action) {
  const assetModel = modelFor(prisma, action.asset.kind);
  const currentRow = await assetModel.findUnique({
    where: { id: action.asset.assetId },
    select: { statesJson: true },
  });
  const currentState = parseStates(currentRow?.statesJson).find((state) => state.id === action.asset.stateId);
  if (!currentRow?.statesJson || !currentState || currentState.image?.artifactId) {
    return { skipped: true, reason: "状态已生成新制品或已不存在" };
  }
  const nextRaw = patchAmbiguousState(currentRow.statesJson, action);
  await prisma.$transaction(async (tx) => {
    const result = await modelFor(tx, action.asset.kind).updateMany({
      where: { id: action.asset.assetId, statesJson: currentRow.statesJson },
      data: { statesJson: nextRaw },
    });
    if (result.count !== 1) {
      throw new Error(`资产在标记缺失期间发生并发更新：${action.asset.assetId}`);
    }
  });
  return { marked: "missing" };
}

async function markCorruptAsMissing(action) {
  const assetModel = modelFor(prisma, action.asset.kind);
  const currentRow = await assetModel.findUnique({
    where: { id: action.asset.assetId },
    select: { statesJson: true },
  });
  const currentState = parseStates(currentRow?.statesJson).find((state) => state.id === action.asset.stateId);
  if (!currentRow?.statesJson || !currentState || currentState.image?.artifactId !== action.asset.artifactId) {
    return { skipped: true, reason: "状态已生成新制品或已不存在" };
  }
  const nextRaw = patchStateAsMissing(
    currentRow.statesJson,
    action,
    "当前图片制品缺失或校验失败，已标记为缺失，请重新生成。",
  );
  await prisma.$transaction(async (tx) => {
    const result = await modelFor(tx, action.asset.kind).updateMany({
      where: { id: action.asset.assetId, statesJson: currentRow.statesJson },
      data: { statesJson: nextRaw },
    });
    if (result.count !== 1) {
      throw new Error(`资产在标记损坏制品期间发生并发更新：${action.asset.assetId}`);
    }
    await tx.storyAssetImageArtifact.updateMany({
      where: { id: action.asset.artifactId, status: "committed" },
      data: { status: "missing" },
    });
  });
  return { marked: "missing" };
}

async function main() {
  const backupDb = valueFor("--backup-db");
  const backupStorage = valueFor("--backup-storage");
  if (apply && (!backupDb || !backupStorage)) {
    throw new Error("--apply 需要同时提供 --backup-db 和 --backup-storage，默认只执行 dry-run。");
  }
  if (apply) {
    await checkBackup(path.resolve(backupDb), "DB backup");
    await checkBackup(path.resolve(backupStorage), "storage backup");
  }

  const rootDir = path.resolve(valueFor("--storage-root") || resolveGeneratedImagesRoot());
  const store = new StoryAssetImageArtifactStore({ rootDir });
  const rows = await attachArtifactValidity(await readAssetRows(), store);
  const report = buildStoryAssetImageAuditReport({
    assets: rows.map(({ statesJson, ...asset }) => asset),
    legacyFiles: await scanLegacyStateImageFiles(rootDir),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;

  const applied = [];
  for (const action of report.actions) {
    if (action.action === "migrate") {
      applied.push({ action, result: await applyMigration(action, store) });
    } else if (action.action === "ambiguous") {
      applied.push({ action, result: await markAmbiguousAsMissing(action) });
    } else if (action.action === "corrupt") {
      applied.push({ action, result: await markCorruptAsMissing(action) });
    }
  }
  console.log(JSON.stringify({ dryRun: false, applied }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
