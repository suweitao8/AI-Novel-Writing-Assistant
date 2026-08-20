import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { agentRuntime } from "../../../../agents";
import { validate } from "../../../../middleware/validate";
import { chapterDetailOutlineService } from "../../planning/application/ChapterDetailOutlineService";
import { chapterReferenceParseService } from "../../planning/application/ChapterReferenceParseService";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

interface RegisterNovelChapterRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices,
    | "listChapters"
    | "createChapter"
    | "updateChapter"
    | "deleteChapter"
    | "ensureChapterExecutionContract"
  >;
  idParamsSchema: z.ZodType<{ id: string }>;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
  chapterSchema: z.ZodTypeAny;
  updateChapterSchema: z.ZodTypeAny;
  chapterExecutionContractSchema: z.ZodTypeAny;
  chapterDetailOutlineSaveSchema: z.ZodTypeAny;
  chapterReferenceParsePreviewSchema: z.ZodTypeAny;
}

export function registerNovelChapterRoutes(input: RegisterNovelChapterRoutesInput): void {
  const {
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    chapterSchema,
    updateChapterSchema,
    chapterExecutionContractSchema,
    chapterDetailOutlineSaveSchema,
    chapterReferenceParsePreviewSchema,
  } = input;

  router.get("/:id/chapters", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listChapters(id);
      res.status(200).json({
        success: true,
        data,
        message: "Chapters loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/chapters",
    validate({ params: idParamsSchema, body: chapterSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.createChapter(id, req.body as any);
        res.status(201).json({
          success: true,
          data,
          message: "Chapter created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/chapters/:chapterId",
    validate({ params: chapterParamsSchema, body: updateChapterSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.updateChapter(
          id,
          chapterId,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Chapter updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete("/:id/chapters/:chapterId", validate({ params: chapterParamsSchema }), async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      await novelService.deleteChapter(id, chapterId);
      res.status(200).json({
        success: true,
        message: "Chapter deleted.",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/:id/chapters/:chapterId/traces",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await agentRuntime.listRuns({ novelId: id, chapterId, limit: 20 });
        res.status(200).json({
          success: true,
          data,
          message: "Chapter traces loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/execution-contract",
    validate({ params: chapterParamsSchema, body: chapterExecutionContractSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.ensureChapterExecutionContract(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter execution contract generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  // 参考文本「解析」：一次调用同时产出分镜初稿与设定建议（纯预览不落库，
  // 前端解析流程负责持久化：初稿经确认写 expectation，提取建议随章节保存）
  router.post(
    "/:id/chapters/:chapterId/reference-parse/preview",
    validate({ params: chapterParamsSchema, body: chapterReferenceParsePreviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await chapterReferenceParseService.previewReferenceParse(
          id,
          chapterId,
          (req.body as { referenceText: string }).referenceText,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Chapter reference parse generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  // 单章细纲：AI 推理草稿（不落库，前端预览编辑）
  router.post(
    "/:id/chapters/:chapterId/detail-outline/preview",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await chapterDetailOutlineService.previewDetailOutline(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter detail outline draft generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  // 单章细纲：保存用户编辑后的节拍
  router.put(
    "/:id/chapters/:chapterId/detail-outline",
    validate({ params: chapterParamsSchema, body: chapterDetailOutlineSaveSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await chapterDetailOutlineService.saveDetailOutline(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter detail outline saved.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
