import { Router } from "express";
import { z } from "zod";

import type { ApiResponse } from "@ai-novel/shared/types/api";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import {
  modelLibraryVisibilityService,
  type ModelLibraryVisibilityState,
} from "../application/ModelLibraryVisibilityService";

const router = Router();
router.use(authMiddleware);

const modelIdSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "模型 ID 不合法。");

router.get("/visibility", async (_req, res, next) => {
  try {
    const hiddenModelIds = await modelLibraryVisibilityService.listHiddenModelIds();
    res.status(200).json({
      success: true,
      data: { hiddenModelIds },
      message: "模型库可见性已加载。",
    } satisfies ApiResponse<{ hiddenModelIds: string[] }>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:modelId/hide",
  validate({ params: z.object({ modelId: modelIdSchema }) }),
  async (req, res, next) => {
    try {
      const { modelId } = req.params as { modelId: string };
      const data = await modelLibraryVisibilityService.hideModel(modelId);
      res.status(200).json({
        success: true,
        data,
        message: "模型已从模型库隐藏。",
      } satisfies ApiResponse<ModelLibraryVisibilityState>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:modelId/hide",
  validate({ params: z.object({ modelId: modelIdSchema }) }),
  async (req, res, next) => {
    try {
      const { modelId } = req.params as { modelId: string };
      const data = await modelLibraryVisibilityService.restoreModel(modelId);
      res.status(200).json({
        success: true,
        data,
        message: "模型已恢复到模型库。",
      } satisfies ApiResponse<ModelLibraryVisibilityState>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
