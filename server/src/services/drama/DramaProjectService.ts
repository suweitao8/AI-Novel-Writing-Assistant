/**
 * 短剧项目服务（P0 骨架）
 *
 * 负责短剧项目的基础生命周期，以及通过防腐层把任意内容源装配为
 * 标准化内容包并落库（含角色资源导入 + 初始事实账本）。
 *
 * 低耦合：本文件只依赖 prisma（基础设施）与 drama 自有契约/端口，
 * 不 import 任何 services/novel/* 业务逻辑。
 */
import { prisma } from "../../db/prisma";
import { sourceContentRegistry } from "./source/SourceContentPort";
import { novelSourceAdapter } from "./source/NovelSourceAdapter";
import { originalSourceAdapter } from "./source/OriginalSourceAdapter";
import { textImportSourceAdapter } from "./source/TextImportSourceAdapter";
import type { DramaSourceType, SourceBundle, SourceRef } from "./contracts/sourceBundle";
import { parseStoryAssetStatesJson } from "@ai-novel/shared/types/novelReferenceExtraction";
import { storyAssetStateImageUpdatedAt } from "@ai-novel/shared/utils/storyAssetSceneStates";

sourceContentRegistry.register(novelSourceAdapter);
sourceContentRegistry.register(originalSourceAdapter);
sourceContentRegistry.register(textImportSourceAdapter);

export interface CreateDramaProjectInput {
  title: string;
  source: DramaSourceType;
  /** 软引用：novel_import 时为 novelId */
  sourceRef?: string;
  track?: string;
  theme?: string;
  targetEpisodes?: number;
  /** 画面风格预设 id（见 dramaVisualStyles） */
  visualStyle?: string;
  /** original / text_import 的原始输入（透传给 adapter） */
  inspiration?: string;
  rawText?: string;
}

export class DramaProjectService {
  async createProject(input: CreateDramaProjectInput) {
    return prisma.dramaProject.create({
      data: {
        title: input.title,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        sourceInput: input.rawText ?? input.inspiration ?? null,
        track: input.track ?? null,
        theme: input.theme ?? null,
        orientation: "horizontal_16_9",
        targetEpisodes: input.targetEpisodes ?? 80,
        visualStyle: input.visualStyle ?? null,
        status: "draft",
      },
    });
  }

  async listProjects() {
    return prisma.dramaProject.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getProject(projectId: string) {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: {
        sourceBundle: true,
        characters: { orderBy: { createdAt: "asc" } },
        episodes: {
          orderBy: { order: "asc" },
          include: {
            storyboards: {
              orderBy: { createdAt: "desc" },
              include: { shots: { orderBy: { order: "asc" } } },
            },
            videoPrompts: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
          },
        },
        videoPrompts: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
        batchJobs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!project) return null;
    return {
      ...project,
      sceneImageVersions: await this.loadSceneImageVersions(project.source, project.sourceRef),
    };
  }

  /**
   * 来源小说各场景当前状态图的生成时间（sceneId → generatedAt）。
   * 分镜列表用它和 3D 草图保存时记录的版本标记对比，识别场景图换版后
   * 背景过期的草图；状态图按稳定路径覆盖存储，URL 对比发现不了换图。
   */
  private async loadSceneImageVersions(
    source: string,
    sourceRef: string | null,
  ): Promise<Record<string, string>> {
    if (source !== "novel_import" || !sourceRef?.trim()) return {};
    const scenes = await prisma.novelScene.findMany({
      where: { novelId: sourceRef.trim() },
      select: { id: true, statesJson: true },
    });
    const versions: Record<string, string> = {};
    for (const scene of scenes) {
      const { states } = parseStoryAssetStatesJson(scene.statesJson);
      for (const state of states) {
        const updatedAt = storyAssetStateImageUpdatedAt(state);
        if (updatedAt) {
          versions[scene.id] = updatedAt;
          break;
        }
      }
    }
    return versions;
  }

  /**
   * 通过防腐层把内容源装配为标准化内容包，并落库：
   * 1) DramaSourceBundle（梗概/节拍/设定/硬事实/原文）
   * 2) DramaCharacter（角色资源导入）
   * 3) DramaFact（初始事实账本，episodeOrder=0 表示源初始事实）
   */
  async assembleSourceBundle(projectId: string): Promise<SourceBundle> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }

    const adapter = sourceContentRegistry.resolve(project.source as DramaSourceType);
    const ref: SourceRef = {
      type: project.source as DramaSourceType,
      ref: project.sourceRef ?? undefined,
      inspiration: project.source === "original" ? project.sourceInput ?? undefined : undefined,
      rawText: project.source === "text_import" ? project.sourceInput ?? undefined : undefined,
    };
    const bundle = await adapter.loadBundle(ref);

    await prisma.$transaction(async (tx) => {
      await tx.dramaSourceBundle.upsert({
        where: { projectId },
        update: {
          synopsis: bundle.synopsis,
          beats: JSON.stringify(bundle.beats),
          worldNotes: bundle.worldNotes ?? null,
          hardFacts: bundle.hardFacts ? JSON.stringify(bundle.hardFacts) : null,
          rawText: bundle.rawText ?? null,
        },
        create: {
          projectId,
          synopsis: bundle.synopsis,
          beats: JSON.stringify(bundle.beats),
          worldNotes: bundle.worldNotes ?? null,
          hardFacts: bundle.hardFacts ? JSON.stringify(bundle.hardFacts) : null,
          rawText: bundle.rawText ?? null,
        },
      });

      // 角色资源导入：按 sourceCharacterRef（缺省按名字）对上已有行原地更新、缺失的补建，
      // 只删除「源侧已移除的自动导入行」。角色行 id 是形象图目录与下游引用的关联键，
      // 整表 deleteMany 重建会换 id，还会连带删掉用户在分镜侧自建的角色；
      // 立绘/四视图/声线是本项目的创作产物而非源内容，更新路径不触碰这些列。
      // 声线没有旧值时用源角色的音色提示词初始化（voiceProfile JSON 的 voicePrompt 键与 readCharacterVoice 的解析对齐）。
      const previousCharacters = await tx.dramaCharacter.findMany({
        where: { projectId },
        select: { id: true, name: true, sourceCharacterRef: true, voiceProfile: true },
      });
      const previousByRef = new Map(
        previousCharacters
          .filter((row) => row.sourceCharacterRef)
          .map((row) => [row.sourceCharacterRef as string, row]),
      );
      const previousByName = new Map(previousCharacters.map((row) => [row.name.trim(), row]));
      const bundleRefs = new Set(
        bundle.characters
          .map((character) => character.sourceCharacterRef)
          .filter((ref): ref is string => Boolean(ref)),
      );
      for (const character of bundle.characters) {
        const previous = (character.sourceCharacterRef && previousByRef.get(character.sourceCharacterRef))
          || previousByName.get(character.name.trim())
          || null;
        if (previous) {
          await tx.dramaCharacter.update({
            where: { id: previous.id },
            data: {
              name: character.name,
              persona: character.persona ?? null,
              relations: character.relations ?? null,
              visualAnchor: character.visualHint
                ? JSON.stringify({ hint: character.visualHint })
                : null,
              voiceProfile: previous.voiceProfile
                ?? (character.voicePrompt ? JSON.stringify({ voicePrompt: character.voicePrompt }) : null),
            },
          });
          continue;
        }
        await tx.dramaCharacter.create({
          data: {
            projectId,
            name: character.name,
            persona: character.persona ?? null,
            relations: character.relations ?? null,
            visualAnchor: character.visualHint
              ? JSON.stringify({ hint: character.visualHint })
              : null,
            sourceCharacterRef: character.sourceCharacterRef ?? null,
            voiceProfile: character.voicePrompt ? JSON.stringify({ voicePrompt: character.voicePrompt }) : null,
          },
        });
      }
      const staleCharacterIds = previousCharacters
        .filter((row) => row.sourceCharacterRef && !bundleRefs.has(row.sourceCharacterRef))
        .map((row) => row.id);
      if (staleCharacterIds.length > 0) {
        await tx.dramaCharacter.deleteMany({ where: { id: { in: staleCharacterIds } } });
      }

      // 初始事实账本（episodeOrder=0 表示源带入的初始硬事实）
      await tx.dramaFact.deleteMany({ where: { projectId, episodeOrder: 0 } });
      if (bundle.hardFacts && bundle.hardFacts.length > 0) {
        await tx.dramaFact.createMany({
          data: bundle.hardFacts.map((fact) => ({
            projectId,
            episodeOrder: 0,
            text: fact.text,
            category: fact.category,
            source: "auto",
          })),
        });
      }

      // 内容包就绪后仅刷新 updatedAt；status 推进交给后续策略/分集阶段
      await tx.dramaProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      });
    });

    return bundle;
  }

  /**
   * 删除以某本小说为内容源的漫剧项目数据（分镜、配音、视频产物随 DramaProject 级联清理）。
   * 只清 drama 侧；小说本体与 RAG 由调用方（novel 删除服务/HTTP 组合层）负责。
   * DramaProject.sourceRef 是软引用（不建外键），删小说前必须先调这里，否则会留下孤儿分镜数据。
   */
  async deleteProjectsByNovelRef(novelId: string): Promise<number> {
    const deleted = await prisma.dramaProject.deleteMany({
      where: { source: "novel_import", sourceRef: novelId },
    });
    return deleted.count;
  }
}

export const dramaProjectService = new DramaProjectService();
