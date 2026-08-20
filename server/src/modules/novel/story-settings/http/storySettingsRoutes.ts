import type { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../../middleware/validate";
import {
  storySettingsService,
  type StorySettingsCategory,
} from "../application/StorySettingsService";
import { worldMapService } from "../application/WorldMapService";
import { shortStoryProductionService } from "../../short-story/application/ShortStoryProductionService";

const novelParams = z.object({ id: z.string().trim().min(1) });
const sceneParams = z.object({ id: z.string().trim().min(1), sceneId: z.string().trim().min(1) });
const propParams = z.object({ id: z.string().trim().min(1), propId: z.string().trim().min(1) });
const characterParams = z.object({ id: z.string().trim().min(1), characterId: z.string().trim().min(1) });

const categorySchema = z.enum(["characters", "scenes", "props", "world"]);

// 资产外观状态：初始 + 换装/受伤/昼夜/损坏等变化态（生图/配音提示词随状态走）。
const assetStateSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(24),
  description: z.string().trim().min(1).max(200),
  imagePrompt: z.string().trim().min(1).max(600),
  voicePrompt: z.string().trim().max(300).optional(),
  chapterOrder: z.number().int().min(0).max(9999).optional(),
  // 生图参考：用同一资产的哪个状态的图当参考（空＝不参考直接生成）
  referenceStateId: z.string().trim().max(60).nullable().optional(),
}).strict();

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).nullable().optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).nullable().optional(),
  physique: z.string().trim().max(200).nullable().optional(),
  attireStyle: z.string().trim().max(400).nullable().optional(),
  facePrompt: z.string().trim().max(600).nullable().optional(),
  voiceTexture: z.string().trim().max(400).nullable().optional(),
  personality: z.string().trim().max(1200).nullable().optional(),
  appearance: z.string().trim().max(1200).nullable().optional(),
  background: z.string().trim().max(2000).nullable().optional(),
  states: z.array(assetStateSchema).max(24).optional(),
});

const worldMapKindSchema = z.enum(["city", "region", "building", "wild", "other"]);
const worldMapTierSchema = z.enum(["capital", "city", "town", "landmark"]);
const worldMapTerrainTypeSchema = z.enum(["plain", "mountain", "water"]);

// 地图保存载荷：坐标是 0-100 平面百分比；旧地图无坐标节点允许 x/y 为空。
// 地形是程序化多边形（平地/山/水）；childMaps 是按上级节点 id 挂接的内部地图（城市/村镇），
// 数据同构递归，深度上限在服务端 normalizeWorldMap 里控制。
const worldMapPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
}).strict();

const worldMapTerrainSchema = z.object({
  id: z.string().trim().min(1).max(60),
  type: worldMapTerrainTypeSchema,
  label: z.string().trim().max(40).optional(),
  points: z.array(worldMapPointSchema).min(3).max(24),
}).strict();

const worldMapNodeUpdateSchema = z.object({
  id: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(40),
  kind: worldMapKindSchema,
  summary: z.string().trim().max(200).optional(),
  x: z.number().min(0).max(100).nullable().optional(),
  y: z.number().min(0).max(100).nullable().optional(),
  tier: worldMapTierSchema.nullable().optional(),
}).strict();

const worldMapEdgeUpdateSchema = z.object({
  fromId: z.string().trim().min(1).max(60),
  toId: z.string().trim().min(1).max(60),
  label: z.string().trim().max(40).optional(),
}).strict();

interface WorldMapUpdateInput {
  overview?: string;
  scaleKm?: number | null;
  terrain?: Array<z.infer<typeof worldMapTerrainSchema>>;
  nodes?: Array<z.infer<typeof worldMapNodeUpdateSchema>>;
  edges?: Array<z.infer<typeof worldMapEdgeUpdateSchema>>;
  childMaps?: Record<string, WorldMapUpdateInput>;
}

const worldMapUpdateSchema: z.ZodType<WorldMapUpdateInput> = z.lazy(() => z.object({
  overview: z.string().trim().max(600).optional(),
  scaleKm: z.number().min(0.1).max(1000000).nullable().optional(),
  terrain: z.array(worldMapTerrainSchema).max(24).optional(),
  nodes: z.array(worldMapNodeUpdateSchema).max(24).optional(),
  edges: z.array(worldMapEdgeUpdateSchema).max(32).optional(),
  childMaps: z.record(z.string().trim().min(1).max(60), worldMapUpdateSchema).optional(),
}).strict());

const worldUpdateSchema = z.object({
  premise: z.string().trim().min(1).max(1200).optional(),
  era: z.string().trim().max(200).nullable().optional(),
  toneRules: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  keySettings: z.array(z.object({
    title: z.string().trim().min(1).max(60),
    content: z.string().trim().min(1).max(1000),
  }).strict()).max(12).optional(),
  artStyles: z.array(z.object({
    label: z.string().trim().min(1).max(20),
    prompt: z.string().trim().max(500).optional(),
  }).strict()).max(12).optional(),
  defaultArtStyle: z.string().trim().min(1).max(40).nullable().optional(),
  map: worldMapUpdateSchema.optional(),
});

const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().max(80).optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).optional(),
  physique: z.string().trim().max(200).optional(),
  attireStyle: z.string().trim().max(400).optional(),
  facePrompt: z.string().trim().max(600).optional(),
  voiceTexture: z.string().trim().max(400).optional(),
  personality: z.string().trim().max(1200).optional(),
  appearance: z.string().trim().max(1200).optional(),
  background: z.string().trim().max(2000).optional(),
  states: z.array(assetStateSchema).max(24).optional(),
});

const sceneCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sceneType: z.enum(["interior", "exterior", "nature"]).optional(),
  summary: z.string().trim().max(600).optional(),
  environmentPrompt: z.string().trim().max(1200).optional(),
  significance: z.string().trim().max(600).optional(),
  mapNodeId: z.string().trim().max(60).optional(),
  states: z.array(assetStateSchema).max(24).optional(),
});

const sceneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sceneType: z.enum(["interior", "exterior", "nature"]).nullable().optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  environmentPrompt: z.string().trim().max(1200).nullable().optional(),
  significance: z.string().trim().max(600).nullable().optional(),
  mapNodeId: z.string().trim().max(60).nullable().optional(),
  states: z.array(assetStateSchema).max(24).optional(),
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
  states: z.array(assetStateSchema).max(24).optional(),
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
  states: z.array(assetStateSchema).max(24).optional(),
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

  router.delete("/:id/settings/characters/:characterId", validate({ params: characterParams }), async (req, res, next) => {
    try {
      await storySettingsService.deleteCharacter(String(req.params.id), String(req.params.characterId));
      res.json({ success: true, data: null } satisfies ApiResponse<null>);
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
      const novelId = String(req.params.id);
      const { map, ...scalarInput } = req.body;
      // 地图与文字设定分属两条保存路径：地图有独立的归一与场景挂点清理逻辑。
      if (map !== undefined) {
        await worldMapService.applyWorldMap(novelId, map);
      }
      if (Object.keys(scalarInput).length > 0) {
        await storySettingsService.updateWorld(novelId, scalarInput);
      }
      const data = await storySettingsService.getWorld(novelId);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  // AI 生成世界地图草稿：纯预览不落库，前端确认后随 PUT /settings/world 保存。
  router.post("/:id/settings/world/map-preview", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await worldMapService.previewWorldMap(String(req.params.id));
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
