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
// （ComicDramaCreateDialog），工作室的「本章初稿自动保存 / 解析与保存细纲 / 参考解析 /
// 手动建章」就是这本小说的正式编辑入口，地位等价于空白小说的 /outline 工作台。
// 放行条件见 isDramaNativeNovel：按小说自身 productionKind 判定（含未生成分镜的新项目）。
// 只放行非破坏性写入：章节删除、正文生成等其余章节端点仍然只读。
// 注意：本守卫挂在 router.use("/:id")，执行期间 req.path 已剥掉 /:id 前缀，
// 这里匹配的是 /chapters/... 形状，不带 novelId 段。
export function isDramaStudioChapterWorkspaceWrite(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.toLowerCase();
  const putChapter = normalizedMethod === "PUT" && /^\/chapters\/[^/]+$/.test(normalizedPath);
  const postChapter = normalizedMethod === "POST" && /^\/chapters$/.test(normalizedPath);
  const detailOutline = (normalizedMethod === "PUT" || normalizedMethod === "POST")
    && /^\/chapters\/[^/]+\/detail-outline(\/preview)?$/.test(normalizedPath);
  const referencePreview = normalizedMethod === "POST"
    && /^\/chapters\/[^/]+\/reference-(draft|extract)\/preview$/.test(normalizedPath);
  return putChapter || postChapter || detailOutline || referencePreview;
}

async function isDramaNativeNovel(novel: { productionKind?: string | null }): Promise<boolean> {
  // 漫剧小说从创建起就是 productionKind=comic_drama（ComicDramaCreateDialog）。
  // 不能用 DramaProject 关联做判定：DramaProject 要到「从成稿生成分镜」才创建，
  // 新建的漫剧项目没有关联行，按关联判定会把分镜生成前的章节工作台全部拦死。
  return novel.productionKind === "comic_drama";
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
      select: { creationExperience: true, productionKind: true },
    });
    if (novel?.creationExperience === "simple") {
      if (
        isDramaStudioChapterWorkspaceWrite(req.method, req.path)
        && await isDramaNativeNovel(novel)
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
