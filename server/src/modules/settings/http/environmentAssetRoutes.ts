// 通用环境资产（HDRI 全景环境）HTTP 入口：资料读写、活跃状态、状态图生成三件套与图片流式返回。
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";

import type { ApiResponse } from "@ai-novel/shared/types/api";
import { STUDIO_ENVIRONMENT_IDS, type StudioEnvironmentId } from "@ai-novel/shared/types/studioEnvironmentAssets";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import { AppError } from "../../../middleware/errorHandler";
import {
  getStudioEnvironmentAssetDocument,
  getStoredStudioEnvironmentAsset,
  saveStudioEnvironmentAsset,
  setActiveStudioEnvironmentState,
  MAX_ENVIRONMENT_STATES,
} from "../../../services/settings/StudioEnvironmentAssetSettingsService";
import { storyStateImagePromptService } from "../../../services/image/StoryStateImagePromptService";
import {
  resolveStudioEnvironmentStateImagePath,
  studioEnvironmentStateImageService,
} from "../../../services/settings/StudioEnvironmentStateImageService";

const router = Router();

router.use(authMiddleware);

const environmentIdSchema = z.string().refine((value) => (STUDIO_ENVIRONMENT_IDS as readonly string[]).includes(value), {
  message: "未知的环境资产。",
});

const stateIdSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "状态 id 不合法。");

const stateSchema = z.object({
  id: stateIdSchema,
  label: z.string().trim().min(1).max(50),
  description: z.string().trim().max(1000).optional(),
  imagePrompt: z.string().trim().max(2000).optional(),
  referenceStateId: stateIdSchema.optional(),
  eraStyle: z.string().trim().max(100).optional(),
  timeOfDay: z.enum(["morning", "noon", "night"]).nullable().optional(),
  weather: z.enum(["sunny", "cloudy", "rainy"]).nullable().optional(),
});

const environmentStatesSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  states: z.array(stateSchema).min(1).max(MAX_ENVIRONMENT_STATES),
});

const activeStateSchema = z.object({ stateId: stateIdSchema });

const tweakPromptSchema = z.object({
  stateLabel: z.string().trim().max(50).optional(),
  imagePrompt: z.string().trim().max(2000).optional(),
  instruction: z.string().trim().min(1).max(500),
});

const emptyParamsSchema = z.object({}).strict();

const dismissImageErrorSchema = z.object({
  error: z.string().trim().min(1).max(600),
  attemptId: z.string().trim().min(1).max(120).optional(),
});

router.get(
  "/environment-assets",
  async (_req, res, next) => {
    try {
      const document = await getStudioEnvironmentAssetDocument();
      res.status(200).json({
        success: true,
        data: document,
        message: "环境资产已加载。",
      } satisfies ApiResponse<typeof document>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/environment-assets/:environmentId",
  validate({ params: z.object({ environmentId: environmentIdSchema }), body: environmentStatesSchema }),
  async (req, res, next) => {
    try {
      const { environmentId } = req.params as { environmentId: string };
      const body = req.body as z.infer<typeof environmentStatesSchema>;
      const environment = await saveStudioEnvironmentAsset(environmentId, {
        description: body.description ?? undefined,
        states: body.states,
      });
      res.status(200).json({
        success: true,
        data: environment,
        message: "环境资产已保存。",
      } satisfies ApiResponse<typeof environment>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/environment-assets/:environmentId/active-state",
  validate({ params: z.object({ environmentId: environmentIdSchema }), body: activeStateSchema }),
  async (req, res, next) => {
    try {
      const { environmentId } = req.params as { environmentId: string };
      const { stateId } = req.body as z.infer<typeof activeStateSchema>;
      const environment = await setActiveStudioEnvironmentState(environmentId, stateId);
      res.status(200).json({
        success: true,
        data: environment,
        message: "当前全景已切换。",
      } satisfies ApiResponse<typeof environment>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/environment-assets/:environmentId/tweak-prompt",
  validate({ params: z.object({ environmentId: environmentIdSchema }), body: tweakPromptSchema }),
  async (req, res, next) => {
    try {
      const { environmentId } = req.params as { environmentId: string };
      const body = req.body as z.infer<typeof tweakPromptSchema>;
      // 与小说场景状态共用同一份微调契约（novel.state_image_prompt.tweak）；
      // 环境是全局资产，不携带小说上下文。
      const document = await getStudioEnvironmentAssetDocument();
      const environment = getStoredStudioEnvironmentAsset(document, environmentId);
      const result = await storyStateImagePromptService.tweakStateImagePrompt(undefined, {
        kind: "scene",
        assetName: environment.label,
        stateLabel: body.stateLabel,
        imagePrompt: body.imagePrompt,
        instruction: body.instruction,
      });
      res.status(200).json({
        success: true,
        data: result,
        message: "图片提示词已改写。",
      } satisfies ApiResponse<typeof result>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/environment-assets/:environmentId/states/:stateId/generate-image",
  validate({ params: z.object({ environmentId: environmentIdSchema, stateId: stateIdSchema }), body: emptyParamsSchema }),
  async (req, res, next) => {
    try {
      const { environmentId, stateId } = req.params as { environmentId: string; stateId: string };
      const environment = await studioEnvironmentStateImageService.generateStateImage(
        environmentId as StudioEnvironmentId,
        stateId,
      );
      res.status(200).json({
        success: true,
        data: environment,
        message: "环境全景已生成。",
      } satisfies ApiResponse<typeof environment>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/environment-assets/:environmentId/states/:stateId/cancel-image",
  validate({ params: z.object({ environmentId: environmentIdSchema, stateId: stateIdSchema }), body: emptyParamsSchema }),
  async (req, res, next) => {
    try {
      const { environmentId, stateId } = req.params as { environmentId: string; stateId: string };
      const environment = await studioEnvironmentStateImageService.cancelStateImage(environmentId as StudioEnvironmentId, stateId);
      res.status(200).json({
        success: true,
        data: environment,
        message: "已终止生成。",
      } satisfies ApiResponse<typeof environment>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/environment-assets/:environmentId/states/:stateId/dismiss-image-error",
  validate({ params: z.object({ environmentId: environmentIdSchema, stateId: stateIdSchema }), body: dismissImageErrorSchema }),
  async (req, res, next) => {
    try {
      const { environmentId, stateId } = req.params as { environmentId: string; stateId: string };
      const body = req.body as z.infer<typeof dismissImageErrorSchema>;
      // 与小说资产状态同契约：只清除用户看到的那次失败（error/attemptId 乐观校验）。
      const environment = await studioEnvironmentStateImageService.dismissStateImageError(
        environmentId as StudioEnvironmentId,
        stateId,
        body.error,
        body.attemptId,
      );
      res.status(200).json({
        success: true,
        data: environment,
        message: "已清除失败提示。",
      } satisfies ApiResponse<typeof environment>);
    } catch (error) {
      next(error);
    }
  },
);

/** GET 环境状态图文件：与小说状态图一致的流式返回与缓存策略。 */
router.get(
  "/environment-assets/:environmentId/states/:stateId/image",
  validate({ params: z.object({ environmentId: environmentIdSchema, stateId: stateIdSchema }) }),
  async (req, res, next) => {
    try {
      const { environmentId, stateId } = req.params as { environmentId: string; stateId: string };
      const resolved = await resolveStudioEnvironmentStateImagePath(environmentId as StudioEnvironmentId, stateId);
      res.setHeader("Content-Type", resolved.mimeType);
      // URL 稳定但内容会被重新生成覆盖，不能缓存旧图一整天。
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      fs.createReadStream(resolved.filePath).pipe(res);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        res.status(404).json({ success: false, message: "该状态还没有生成图片。" });
        return;
      }
      next(error);
    }
  },
);

export default router;
