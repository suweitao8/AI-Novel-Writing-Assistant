import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  dramaProjectService,
  type CreateDramaProjectInput,
} from "../DramaProjectService";
import { dramaStoryboardService } from "../DramaStoryboardService";
import type { DramaLLMOptions } from "../DramaStrategyService";

interface BridgeNovel {
  id: string;
  title: string;
}

interface BridgeChapter {
  id: string;
  order: number;
  title: string;
  expectation: string | null;
}

interface BridgeProject {
  id: string;
  title: string;
  visualStyle?: string | null;
}

export interface ComicDramaStoryboardBridgeDependencies {
  prisma: {
    novel: {
      findUnique(args: unknown): Promise<BridgeNovel | null>;
    };
    chapter: {
      findFirst(args: unknown): Promise<BridgeChapter | null>;
    };
    dramaProject: {
      findFirst(args: unknown): Promise<BridgeProject | null>;
    };
    dramaEpisode: {
      upsert(args: unknown): Promise<unknown>;
    };
  };
  dramaProjectService: {
    createProject(input: CreateDramaProjectInput): Promise<BridgeProject>;
    assembleSourceBundle(projectId: string): Promise<unknown>;
  };
  dramaStoryboardService: {
    generateStoryboard(projectId: string, episodeOrder: number, options: DramaLLMOptions): Promise<unknown>;
  };
}

export interface ComicDramaStoryboardBridgeOptions extends DramaLLMOptions {
  visualStyle?: string;
}

/**
 * 把漫剧工作台保存的章节脚本接入既有 Drama 管线。
 *
 * 小说阶段的工作台脚本保存在 Chapter.expectation；Drama 分镜生成器只读取
 * DramaEpisode.content，因此这里是唯一的“当前选中章节”桥接入口，避免前端
 * 直接拼装项目、分集和分镜数据导致状态分叉。
 */
export class ComicDramaStoryboardBridgeService {
  constructor(
    private readonly deps: ComicDramaStoryboardBridgeDependencies = {
      prisma: prisma as unknown as ComicDramaStoryboardBridgeDependencies["prisma"],
      dramaProjectService: dramaProjectService as unknown as ComicDramaStoryboardBridgeDependencies["dramaProjectService"],
      dramaStoryboardService: dramaStoryboardService as unknown as ComicDramaStoryboardBridgeDependencies["dramaStoryboardService"],
    },
  ) {}

  async generateStoryboardFromNovelChapter(
    novelId: string,
    chapterOrder: number,
    options: ComicDramaStoryboardBridgeOptions = {},
  ) {
    const novel = await this.deps.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true },
    });
    if (!novel) {
      throw new AppError("没有找到这个漫剧项目。", 404);
    }

    const chapter = await this.deps.prisma.chapter.findFirst({
      where: { novelId, order: chapterOrder },
      select: { id: true, order: true, title: true, expectation: true },
    });
    if (!chapter) {
      throw new AppError(`没有找到第 ${chapterOrder} 章。`, 404);
    }

    const script = chapter.expectation?.trim() ?? "";
    if (!script) {
      throw new AppError(`第 ${chapterOrder} 章还没有可生成的脚本。`, 400);
    }

    const existingProject = await this.deps.prisma.dramaProject.findFirst({
      where: { source: "novel_import", sourceRef: novelId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const project = existingProject ?? await this.deps.dramaProjectService.createProject({
      title: novel.title.trim() || "漫剧项目",
      source: "novel_import",
      sourceRef: novelId,
      visualStyle: options.visualStyle,
    });

    // 每次生成前同步资产和来源事实，确保当前章节的角色/场景/道具引用来自最新数据。
    await this.deps.dramaProjectService.assembleSourceBundle(project.id);

    const episode = await this.deps.prisma.dramaEpisode.upsert({
      where: { projectId_order: { projectId: project.id, order: chapter.order } },
      create: {
        projectId: project.id,
        order: chapter.order,
        title: chapter.title,
        content: script,
        status: "scripted",
      },
      update: {
        title: chapter.title,
        content: script,
        status: "scripted",
        qualityFlags: null,
      },
    });

    const { visualStyle: _visualStyle, ...llmOptions } = options;
    const storyboard = await this.deps.dramaStoryboardService.generateStoryboard(
      project.id,
      chapter.order,
      llmOptions,
    );
    return {
      projectId: project.id,
      episodeOrder: chapter.order,
      episode,
      storyboard,
    };
  }
}

export const comicDramaStoryboardBridgeService = new ComicDramaStoryboardBridgeService();
