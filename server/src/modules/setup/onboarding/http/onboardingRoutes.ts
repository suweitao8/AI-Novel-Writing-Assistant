import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { authMiddleware } from "../../../../middleware/auth";
import { getFirstNovelOnboardingProjection } from "../application/FirstNovelOnboardingService";

const router = Router();

router.use(authMiddleware);

router.get("/onboarding/first-novel", async (_req, res, next) => {
  try {
    const data = await getFirstNovelOnboardingProjection();
    res.status(200).json({
      success: true,
      data,
      message: "第一本书创作进度已更新。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
