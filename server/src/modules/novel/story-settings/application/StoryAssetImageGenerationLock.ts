import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { type StoryAssetKind } from "./StoryAssetStateImageStorage";

export type StoryAssetImageArtifactStatus = "staging" | "committed" | "orphaned" | "missing";

export interface StoryAssetImageArtifactRecord {
  id: string;
  novelId: string;
  kind: string;
  assetId: string;
  stateId: string;
  generationId: string;
  storageKey: string;
  status: string;
  activeLockKey: string | null;
  leaseExpiresAt: Date | null;
}

type ArtifactDelegate = PrismaClient["storyAssetImageArtifact"];
type ArtifactDb = Pick<PrismaClient, "storyAssetImageArtifact">;

export interface StoryAssetImageTarget {
  novelId: string;
  kind: StoryAssetKind;
  assetId: string;
  stateId: string;
}

export interface StoryAssetImageGenerationLease {
  artifact: StoryAssetImageArtifactRecord;
  targetKey: string;
  leaseExpiresAt: Date;
  renewalIntervalMs: number;
  release(): Promise<void>;
  renew(): Promise<Date>;
  commit(): Promise<StoryAssetImageArtifactRecord>;
}

export interface StoryAssetImageActiveTarget {
  assetId: string;
  stateId: string;
}

export interface StoryAssetImageGenerationLockOptions {
  db?: ArtifactDb;
  now?: () => Date;
  leaseMs?: number;
}

/** 资产状态 id 不是全局主键，锁键必须包含完整所有权范围。 */
export function buildStoryAssetImageTargetKey(target: StoryAssetImageTarget): string {
  return [target.novelId, target.kind, target.assetId, target.stateId]
    .map((part) => part.trim())
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function generationId(): string {
  return randomUUID().replaceAll("-", "");
}

function storageSegment(value: string): string {
  return `id-${encodeURIComponent(value.trim() || "_")}`;
}

function isLeaseActive(record: Pick<StoryAssetImageArtifactRecord, "leaseExpiresAt">, now: Date): boolean {
  return Boolean(record.leaseExpiresAt && record.leaseExpiresAt.getTime() > now.getTime());
}

export class StoryAssetImageGenerationLock {
  private readonly db: ArtifactDb;
  private readonly now: () => Date;
  private readonly leaseMs: number;

  constructor(options: StoryAssetImageGenerationLockOptions = {}) {
    this.db = options.db ?? prisma;
    this.now = options.now ?? (() => new Date());
    this.leaseMs = Math.max(30_000, options.leaseMs ?? 15 * 60 * 1000);
  }

  /** 返回仍在有效 lease 内的状态图目标，供资产列表把跨进程任务投影为生成中。 */
  async listActiveTargets(novelId: string, kind: StoryAssetKind): Promise<StoryAssetImageActiveTarget[]> {
    const records = await (this.db.storyAssetImageArtifact as ArtifactDelegate).findMany({
      where: {
        novelId,
        kind,
        status: "staging",
        activeLockKey: { not: null },
        leaseExpiresAt: { gt: this.now() },
      },
      select: { assetId: true, stateId: true },
    });
    return records.map((record) => ({ assetId: record.assetId, stateId: record.stateId }));
  }

  async acquire(target: StoryAssetImageTarget): Promise<StoryAssetImageGenerationLease> {
    const targetKey = buildStoryAssetImageTargetKey(target);
    const now = this.now();
    const current = await this.db.storyAssetImageArtifact.findFirst({
      where: { activeLockKey: targetKey },
      orderBy: { updatedAt: "desc" },
    });

    if (current && isLeaseActive(current, now)) {
      throw new AppError("该资产状态正在生成图片，请等待当前生成完成。", 409);
    }
    if (current) {
      const reclaimed = await this.db.storyAssetImageArtifact.updateMany({
        where: {
          id: current.id,
          activeLockKey: targetKey,
          leaseExpiresAt: { lte: now },
        },
        data: { activeLockKey: null, leaseExpiresAt: null, status: "orphaned" },
      });
      if (reclaimed.count !== 1) {
        throw new AppError("该资产状态刚刚被其他生成任务占用，请稍后重试。", 409);
      }
    }

    const nextLeaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    const nextGenerationId = generationId();
    const storageKey = [
      "story-state-images",
      `id-${encodeURIComponent(target.novelId.trim() || "_")}`,
      target.kind,
      `id-${encodeURIComponent(target.assetId.trim() || "_")}`,
      `id-${encodeURIComponent(target.stateId.trim() || "_")}`,
      "generations",
      storageSegment(nextGenerationId),
    ].join("/");

    let artifact: StoryAssetImageArtifactRecord;
    try {
      artifact = await (this.db.storyAssetImageArtifact as ArtifactDelegate).create({
        data: {
          id: `artifact_${nextGenerationId}`,
          novelId: target.novelId,
          kind: target.kind,
          assetId: target.assetId,
          stateId: target.stateId,
          generationId: nextGenerationId,
          storageKey,
          status: "staging",
          activeLockKey: targetKey,
          leaseExpiresAt: nextLeaseExpiresAt,
        },
      });
    } catch (error) {
      throw new AppError("该资产状态刚刚被其他生成任务占用，请稍后重试。", 409, { cause: error });
    }

    return {
      artifact,
      targetKey,
      leaseExpiresAt: nextLeaseExpiresAt,
      renewalIntervalMs: Math.max(1_000, Math.floor(this.leaseMs / 3)),
      release: async () => {
        await this.db.storyAssetImageArtifact.updateMany({
          where: { id: artifact.id, activeLockKey: targetKey },
          data: { activeLockKey: null, leaseExpiresAt: null, status: "orphaned" },
        });
      },
      renew: async () => {
        const renewalNow = this.now();
        const renewedLeaseExpiresAt = new Date(renewalNow.getTime() + this.leaseMs);
        const result = await this.db.storyAssetImageArtifact.updateMany({
          where: {
            id: artifact.id,
            activeLockKey: targetKey,
            status: "staging",
            leaseExpiresAt: { gt: renewalNow },
          },
          data: { leaseExpiresAt: renewedLeaseExpiresAt },
        });
        if (result.count !== 1) {
          throw new AppError("图片制品生成租约已失效，请重新生成。", 409);
        }
        return renewedLeaseExpiresAt;
      },
      commit: async () => {
        const commitNow = this.now();
        const result = await this.db.storyAssetImageArtifact.updateMany({
          where: {
            id: artifact.id,
            activeLockKey: targetKey,
            status: "staging",
            leaseExpiresAt: { gt: commitNow },
          },
          data: { activeLockKey: null, leaseExpiresAt: null, status: "committed" },
        });
        if (result.count !== 1) {
          throw new AppError("图片制品提交锁已失效，请重新生成。", 409);
        }
        return {
          ...artifact,
          status: "committed",
          activeLockKey: null,
          leaseExpiresAt: null,
        };
      },
    };
  }
}

export const storyAssetImageGenerationLock = new StoryAssetImageGenerationLock();
