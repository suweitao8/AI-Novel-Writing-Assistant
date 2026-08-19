import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";

export function isSimpleCreationWriteAllowed(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }
  const normalizedPath = path.toLowerCase();
  // 简易模式整体只读，但三类工作台端点例外：
  // - creation-experience / export：模式切换与导出；
  // - settings：设定中心（角色/场景/道具/世界观）是简易书架的正式编辑入口；
  // - outline：空白小说的大纲工作台（简略大纲与分章细纲在导演启动前属于用户输入区）。
  return /\/creation-experience\/(simple|professional)$/.test(normalizedPath)
    || normalizedPath.includes("/export")
    || normalizedPath.includes("/settings")
    || normalizedPath.includes("/outline");
}

// 漫剧工作室的单章工作台端点。漫剧项目的小说固定以简易模式创建
// （ComicDramaCreateDialog），工作室的「本章大纲自动保存 / 解析与保存细纲 / 手动建章」
// 就是这本小说的正式编辑入口，地位等价于空白小说的 /outline 工作台。
// 只放行非破坏性写入：章节删除、正文生成等其余章节端点仍然只读。
export function isDramaStudioChapterWorkspaceWrite(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.toLowerCase();
  const putChapter = normalizedMethod === "PUT" && /^\/[^/]+\/chapters\/[^/]+$/.test(normalizedPath);
  const postChapter = normalizedMethod === "POST" && /^\/[^/]+\/chapters$/.test(normalizedPath);
  const detailOutline = (normalizedMethod === "PUT" || normalizedMethod === "POST")
    && /^\/[^/]+\/chapters\/[^/]+\/detail-outline(\/preview)?$/.test(normalizedPath);
  return putChapter || postChapter || detailOutline;
}

async function isNovelLinkedToDramaProject(novelId: string): Promise<boolean> {
  // DramaProject.sourceRef 是软引用（source=novel_import 时存 novelId），
  // 与工作室 overview 的反查约定保持一致。
  const project = await prisma.dramaProject.findFirst({
    where: { source: "novel_import", sourceRef: novelId },
    select: { id: true },
  });
  return project !== null;
}

export async function guardSimpleCreationUserWrites(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (isSimpleCreationWriteAllowed(req.method, req.path)) {
      next();
      return;
    }
    const novelId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!novelId) {
      next();
      return;
    }
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { creationExperience: true },
    });
    if (novel?.creationExperience === "simple") {
      if (
        isDramaStudioChapterWorkspaceWrite(req.method, req.path)
        && await isNovelLinkedToDramaProject(novelId)
      ) {
        next();
        return;
      }
      next(new AppError(
        "简易模式项目当前仅供阅读。如需修改，请先切换到专业模式。",
        409,
      ));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
