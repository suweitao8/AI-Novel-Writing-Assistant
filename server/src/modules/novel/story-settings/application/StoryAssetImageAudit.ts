import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { StoryAssetKind } from "./StoryAssetStateImageStorage";

export interface StoryAssetImageAuditAsset {
  novelId: string;
  kind: StoryAssetKind;
  assetId: string;
  stateId: string;
  imageStatus: string;
  artifactId?: string | null;
  /** CLI 在校验制品表归属、状态和文件 hash 后提供；false 表示悬空或损坏指针。 */
  artifactValid?: boolean;
  generatedAt?: string | null;
}

export interface LegacyStateImageFile {
  stateId: string;
  filePath: string;
  extension: "png" | "jpg" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  mtimeMs: number;
  sha256?: string;
  byteSize?: number;
}

export type StoryAssetImageAuditAction =
  | { action: "already_committed"; asset: StoryAssetImageAuditAsset; reason: string }
  | { action: "corrupt"; asset: StoryAssetImageAuditAsset; reason: string }
  | { action: "migrate"; asset: StoryAssetImageAuditAsset; file: LegacyStateImageFile; reason: string }
  | { action: "ambiguous"; asset: StoryAssetImageAuditAsset; candidateFiles: LegacyStateImageFile[]; reason: string }
  | { action: "missing"; asset: StoryAssetImageAuditAsset; reason: string };

export interface StoryAssetImageAuditReport {
  dryRun: true;
  generatedAt: string;
  actions: StoryAssetImageAuditAction[];
}

export interface BackupFileCheck {
  filePath: string;
  byteSize: number;
}

export function assertBackupFile(filePath: string): Promise<BackupFileCheck> {
  return fs.stat(filePath).then((stat) => {
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`备份文件不存在或为空：${filePath}`);
    }
    return { filePath, byteSize: stat.size };
  });
}

function generatedAtMatchesFile(asset: StoryAssetImageAuditAsset, file: LegacyStateImageFile): boolean {
  if (!asset.generatedAt) {
    return false;
  }
  const generatedAtMs = Date.parse(asset.generatedAt);
  return Number.isFinite(generatedAtMs) && Math.abs(file.mtimeMs - generatedAtMs) <= 5 * 60 * 1000;
}

/**
 * 只生成迁移计划，不写 DB 和文件。只有生成时间与文件修改时间的正向证据足够唯一时
 * 才迁移；仅凭 stateId 或「当前只有一个资产」不能证明 legacy 文件归属。
 */
export function buildStoryAssetImageAuditReport(input: {
  assets: StoryAssetImageAuditAsset[];
  legacyFiles: LegacyStateImageFile[];
  now?: Date;
}): StoryAssetImageAuditReport {
  const filesByState = new Map<string, LegacyStateImageFile[]>();
  for (const file of input.legacyFiles) {
    const files = filesByState.get(file.stateId) ?? [];
    files.push(file);
    filesByState.set(file.stateId, files);
  }

  const claimedFiles = new Set<string>();
  const actions: StoryAssetImageAuditAction[] = [];
  for (const asset of input.assets) {
    if (asset.artifactId?.trim()) {
      if (asset.artifactValid === false) {
        actions.push({ action: "corrupt", asset, reason: "当前制品指针不存在、归属不匹配或文件校验失败" });
        continue;
      }
      actions.push({ action: "already_committed", asset, reason: "已有当前制品指针" });
      continue;
    }
    if (asset.imageStatus !== "done") {
      actions.push({ action: "missing", asset, reason: "状态图不是 done，等待重新生成" });
      continue;
    }

    const candidates = (filesByState.get(asset.stateId) ?? [])
      .filter((file) => !claimedFiles.has(file.filePath));
    if (candidates.length === 0) {
      actions.push({ action: "missing", asset, reason: "没有找到 legacy 状态图文件" });
      continue;
    }

    const timeMatches = candidates.filter((file) => generatedAtMatchesFile(asset, file));
    if (timeMatches.length === 1) {
      claimedFiles.add(timeMatches[0].filePath);
      actions.push({ action: "migrate", asset, file: timeMatches[0], reason: "文件修改时间与生成时间唯一匹配" });
      continue;
    }
    actions.push({
      action: "ambiguous",
      asset,
      candidateFiles: candidates,
      reason: timeMatches.length > 1 ? "多个 legacy 文件同时匹配" : "同名状态存在多个资产，无法安全归属",
    });
  }

  return {
    dryRun: true,
    generatedAt: (input.now ?? new Date()).toISOString(),
    actions,
  };
}

export async function scanLegacyStateImageFiles(rootDir: string): Promise<LegacyStateImageFile[]> {
  const legacyRoot = path.join(rootDir, "story-state-images");
  const entries = await fs.readdir(legacyRoot, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const results: LegacyStateImageFile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("id-")) {
      continue;
    }
    for (const [extension, mimeType] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      const filePath = path.join(legacyRoot, entry.name, `image.${extension}`);
      try {
        const [stat, bytes] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
        if (!stat.isFile()) {
          continue;
        }
        results.push({
          stateId: entry.name,
          filePath,
          extension,
          mimeType,
          mtimeMs: stat.mtimeMs,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          byteSize: bytes.length,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
  return results;
}
