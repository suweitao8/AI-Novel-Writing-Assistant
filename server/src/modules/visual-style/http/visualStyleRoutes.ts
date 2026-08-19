import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import { visualStyleService } from "../../../services/visualStyle/VisualStyleService";

const router = Router();

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const keyParamsSchema = z.object({
  key: z.string().trim().min(1),
});

const styleFamilySchema = z.enum(["live_action", "animation"]);
const animationSubtypeSchema = z.enum(["2d", "3d", "hybrid"]);

const upsertSchema = z.object({
  key: z.string().trim().min(2).max(40),
  label: z.string().trim().min(1).max(40),
  name: z.string().trim().max(60).nullable().optional(),
  styleInstructions: z.string().trim().min(20).max(4000),
  avoidInstructions: z.string().trim().min(10).max(2000),
  styleTag: z.string().trim().min(2).max(80),
  styleFamily: styleFamilySchema,
  animationSubtype: animationSubtypeSchema.nullable().optional(),
});

const updateSchema = upsertSchema.partial();

const analyzeSchema = z.object({
  imageBase64: z.string().min(10),
  mimeType: z.string().trim().min(3),
  userHint: z.string().trim().max(500).optional(),
});

router.use(authMiddleware);

router.get("/", async (_req, res, next) => {
  try {
    const data = await visualStyleService.listStyles();
    res.status(200).json({
      success: true,
      data,
      message: "Visual styles loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: upsertSchema }), async (req, res, next) => {
  try {
    const data = await visualStyleService.createCustomStyle(req.body as z.infer<typeof upsertSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "Visual style created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/analyze", validate({ body: analyzeSchema }), async (req, res, next) => {
  try {
    const data = await visualStyleService.analyzeReferenceImage(req.body as z.infer<typeof analyzeSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Visual style analysis generated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:key", validate({ params: keyParamsSchema }), async (req, res, next) => {
  try {
    const { key } = req.params as z.infer<typeof keyParamsSchema>;
    const data = await visualStyleService.getStyleDetail(key);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "Visual style not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Visual style loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", validate({ params: idParamsSchema, body: updateSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await visualStyleService.updateCustomStyle(id, req.body as z.infer<typeof updateSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Visual style updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await visualStyleService.deleteCustomStyle(id);
    res.status(200).json({
      success: true,
      data: null,
      message: "Visual style deleted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
