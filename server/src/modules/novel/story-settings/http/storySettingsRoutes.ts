import type { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../../middleware/validate";
import {
  storySettingsService,
  type StorySettingsCategory,
} from "../application/StorySettingsService";
import { shortStoryProductionService } from "../../short-story/application/ShortStoryProductionService";

const novelParams = z.object({ id: z.string().trim().min(1) });
const sceneParams = z.object({ id: z.string().trim().min(1), sceneId: z.string().trim().min(1) });
const propParams = z.object({ id: z.string().trim().min(1), propId: z.string().trim().min(1) });
const characterParams = z.object({ id: z.string().trim().min(1), characterId: z.string().trim().min(1) });

const categorySchema = z.enum(["characters", "scenes", "props", "world"]);

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  personality: z.string().trim().max(1200).nullable().optional(),
  appearance: z.string().trim().max(1200).nullable().optional(),
  background: z.string().trim().max(2000).nullable().optional(),
});

const worldUpdateSchema = z.object({
  premise: z.string().trim().min(1).max(1200).optional(),
  era: z.string().trim().max(200).nullable().optional(),
  toneRules: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  keySettings: z.array(z.object({
    title: z.string().trim().min(1).max(60),
    content: z.string().trim().min(1).max(1000),
  }).strict()).max(12).optional(),
});

const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(80),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).optional(),
  physique: z.string().trim().max(200).optional(),
  attireStyle: z.string().trim().max(400).optional(),
  facePrompt: z.string().trim().max(600).optional(),
  personality: z.string().trim().max(1200).optional(),
  appearance: z.string().trim().max(1200).optional(),
  background: z.string().trim().max(2000).optional(),
});

const sceneCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sceneType: z.enum(["interior", "exterior", "nature"]).optional(),
  summary: z.string().trim().max(600).optional(),
  environmentPrompt: z.string().trim().max(1200).optional(),
  significance: z.string().trim().max(600).optional(),
  mapNodeId: z.string().trim().max(60).optional(),
});

const sceneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sceneType: z.enum(["interior", "exterior", "nature"]).nullable().optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  environmentPrompt: z.string().trim().max(1200).nullable().optional(),
  significance: z.string().trim().max(600).nullable().optional(),
  mapNodeId: z.string().trim().max(60).nullable().optional(),
});

const propCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  propType: z.enum(["weapon", "accessory", "artifact", "document", "furniture", "object"]).optional(),
  description: z.string().trim().max(800).optional(),
  plotFunction: z.string().trim().max(800).optional(),
  visualPrompt: z.string().trim().max(600).optional(),
  ownerCharacterId: z.string().trim().max(60).optional(),
  importance: z.enum(["core", "major", "minor"]).optional(),
  firstAppearHint: z.string().trim().max(300).optional(),
});

const propUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  propType: z.enum(["weapon", "accessory", "artifact", "document", "furniture", "object"]).nullable().optional(),
  description: z.string().trim().max(800).nullable().optional(),
  plotFunction: z.string().trim().max(800).nullable().optional(),
  visualPrompt: z.string().trim().max(600).nullable().optional(),
  ownerCharacterId: z.string().trim().max(60).nullable().optional(),
  importance: z.enum(["core", "major", "minor"]).optional(),
  firstAppearHint: z.string().trim().max(300).nullable().optional(),
});

const entityGenerateSchema = z.object({
  hint: z.string().trim().max(300).optional(),
});

const ensureSchema = z.object({
  categories: z.array(categorySchema).max(4).optional(),
});

const regenerateSchema = z.object({
  category: categorySchema,
});

export function registerStorySettingsRoutes(router: Router): void {
  router.get("/:id/settings/overview", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.getOverview(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/settings/scenes", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.listScenes(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/scenes", validate({ params: novelParams, body: sceneCreateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.createScene(String(req.params.id), req.body);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/settings/scenes/:sceneId", validate({ params: sceneParams, body: sceneUpdateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.updateScene(
        String(req.params.id),
        String(req.params.sceneId),
        req.body,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/settings/scenes/:sceneId", validate({ params: sceneParams }), async (req, res, next) => {
    try {
      await storySettingsService.deleteScene(String(req.params.id), String(req.params.sceneId));
      res.json({ success: true, data: null } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/settings/props", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.listProps(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/props", validate({ params: novelParams, body: propCreateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.createProp(String(req.params.id), req.body);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/settings/props/:propId", validate({ params: propParams, body: propUpdateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.updateProp(
        String(req.params.id),
        String(req.params.propId),
        req.body,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/settings/props/:propId", validate({ params: propParams }), async (req, res, next) => {
    try {
      await storySettingsService.deleteProp(String(req.params.id), String(req.params.propId));
      res.json({ success: true, data: null } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/settings/characters", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.listCharacters(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/settings/characters/:characterId", validate({
    params: characterParams,
    body: characterUpdateSchema,
  }), async (req, res, next) => {
    try {
      const data = await storySettingsService.updateCharacter(
        String(req.params.id),
        String(req.params.characterId),
        req.body,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/settings/world", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.getWorld(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/settings/world", validate({ params: novelParams, body: worldUpdateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.updateWorld(String(req.params.id), req.body);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/ensure", validate({ params: novelParams, body: ensureSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.ensureSettings(String(req.params.id), {
        categories: (req.body as z.infer<typeof ensureSchema>).categories,
      });
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/regenerate", validate({ params: novelParams, body: regenerateSchema }), async (req, res, next) => {
    try {
      const category = (req.body as z.infer<typeof regenerateSchema>).category as StorySettingsCategory;
      await storySettingsService.regenerate(String(req.params.id), category);
      res.json({ success: true, data: null } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/characters", validate({ params: novelParams, body: characterCreateSchema }), async (req, res, next) => {
    try {
      const data = await storySettingsService.createCharacter(String(req.params.id), req.body);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/characters/generate", validate({ params: novelParams, body: entityGenerateSchema }), async (req, res, next) => {
    try {
      const hint = (req.body as z.infer<typeof entityGenerateSchema>).hint;
      const data = await storySettingsService.generateEntityDraft(String(req.params.id), "character", hint);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/scenes/generate", validate({ params: novelParams, body: entityGenerateSchema }), async (req, res, next) => {
    try {
      const hint = (req.body as z.infer<typeof entityGenerateSchema>).hint;
      const data = await storySettingsService.generateEntityDraft(String(req.params.id), "scene", hint);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/settings/props/generate", validate({ params: novelParams, body: entityGenerateSchema }), async (req, res, next) => {
    try {
      const hint = (req.body as z.infer<typeof entityGenerateSchema>).hint;
      const data = await storySettingsService.generateEntityDraft(String(req.params.id), "prop", hint);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  // 短篇设定确认：放行生产任务并立即调度（调度放在路由层，避免 story-settings 与 short-story 模块循环依赖）。
  router.post("/:id/settings/confirm", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.confirmShortStorySettings(String(req.params.id));
      if (data.taskId) {
        shortStoryProductionService.schedule(data.taskId);
      }
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
