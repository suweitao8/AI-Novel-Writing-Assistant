// 空白小说大纲工作台路由：简略大纲读写、AI 细纲推理（草稿）、确认细纲落库。
// 简易模式小说依赖这些端点（simpleCreationWriteGuard 已放行 /outline 路径）。
import type { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../../middleware/validate";
import { novelOutlineService } from "../application/NovelOutlineService";

const novelParams = z.object({ id: z.string().trim().min(1) });

const outlineUpdateSchema = z.object({
  outline: z.string().max(20000),
});

const outlineExpandSchema = z.object({
  targetChapterCount: z.number().int().min(3).max(400).optional(),
});

const chapterOutlineItemSchema = z.object({
  title: z.string().trim().min(1).max(60),
  synopsis: z.string().trim().min(1).max(600),
  keyEvents: z.array(z.string().trim().min(1).max(120)).max(5).default([]),
  characterNames: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  sceneNames: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
});

const chapterOutlineSaveSchema = z.object({
  premise: z.string().trim().min(1).max(600),
  chapters: z.array(chapterOutlineItemSchema).min(3).max(400),
});

export function registerNovelOutlineRoutes(router: Router): void {
  router.get("/:id/outline", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await novelOutlineService.getOutlineState(String(req.params.id));
      res.status(200).json({ success: true, data, message: "大纲状态已加载。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/outline", validate({ params: novelParams, body: outlineUpdateSchema }), async (req, res, next) => {
    try {
      const data = await novelOutlineService.saveOutline(
        String(req.params.id),
        (req.body as z.infer<typeof outlineUpdateSchema>).outline,
      );
      res.status(200).json({ success: true, data, message: "简略大纲已保存。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/outline/expand", validate({ params: novelParams, body: outlineExpandSchema }), async (req, res, next) => {
    try {
      const data = await novelOutlineService.expandOutline(
        String(req.params.id),
        (req.body as z.infer<typeof outlineExpandSchema>),
      );
      res.status(200).json({ success: true, data, message: "分章细纲草稿已生成。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/outline/chapters", validate({ params: novelParams, body: chapterOutlineSaveSchema }), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof chapterOutlineSaveSchema>;
      const data = await novelOutlineService.saveChapterOutline(String(req.params.id), body);
      res.status(200).json({ success: true, data, message: "分章细纲已确认保存。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
