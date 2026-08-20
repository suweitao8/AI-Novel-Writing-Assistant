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

// 漫剧项目（productionKind=comic_drama）不适用简易模式只读（2026-08-20 用户决定，
// 彻底根治）：漫剧工作室就是这本书的正式编辑入口——章节增删改、参考解析、细纲、
// 设定全部可编辑。此前按端点路径白名单放行漫剧的工作台写入，端点改名
// （reference-draft/extract → reference-parse）后白名单失配，把「解析」拦死，
// 已两次踩坑——路径字符串守卫跟不上端点演进，按项目类型整体放行杜绝复发。
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
    if (novel?.creationExperience === "simple" && novel.productionKind !== "comic_drama") {
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
