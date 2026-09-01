// 漫剧卡片预览图的场景选择入口：独立于持续膨胀的 dramaRoutes，
// 只承载「设定 · 通用」里选择预览场景这一件事。
import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { AppError } from "../../../middleware/errorHandler";
import { prisma } from "../../../db/prisma";

const router = Router();

const previewSceneParamsSchema = z.object({ id: z.string().trim().min(1) });
const previewSceneBodySchema = z.object({
  // null = 取消显式选择，回到默认（第一个有图的场景）。
  sceneId: z.string().trim().min(1).nullable(),
});

router.patch(
  "/projects/:id/preview-scene",
  validate({ params: previewSceneParamsSchema, body: previewSceneBodySchema }),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const { sceneId } = req.body as { sceneId: string | null };
      const project = await prisma.dramaProject.findUnique({
        where: { id },
        select: { id: true, sourceRef: true },
      });
      if (!project) {
        throw new AppError("没有找到这个漫剧项目。", 404);
      }
      if (sceneId) {
        if (!project.sourceRef) {
          throw new AppError("这个漫剧项目没有关联的小说场景，无法选择预览图。", 400);
        }
        const scene = await prisma.novelScene.findFirst({
          where: { id: sceneId, novelId: project.sourceRef },
          select: { id: true },
        });
        if (!scene) {
          throw new AppError("没有找到这个场景。", 404);
        }
      }
      const updated = await prisma.dramaProject.update({
        where: { id: project.id },
        data: { previewSceneId: sceneId ?? null },
        select: { id: true, previewSceneId: true },
      });
      res.status(200).json({
        success: true,
        data: { projectId: updated.id, previewSceneId: updated.previewSceneId ?? null },
        message: "预览场景已保存。",
      } satisfies ApiResponse<{ projectId: string; previewSceneId: string | null }>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
