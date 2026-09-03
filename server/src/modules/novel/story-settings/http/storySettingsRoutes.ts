import type { Router } from "express";
import fs from "fs";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS,
  STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { validate } from "../../../../middleware/validate";
import {
  storySettingsService,
  type StorySettingsCategory,
} from "../application/StorySettingsService";
import { storyAssetStateImageService } from "../application/StoryAssetStateImageService";
import { storyAssetStateVoiceService } from "../application/StoryAssetStateVoiceService";
import { storyStateImagePromptService } from "../application/StoryStateImagePromptService";
import { worldMapService } from "../application/WorldMapService";
import { storyAssetImageService } from "../application/StoryAssetImageService";
import { shortStoryProductionService } from "../../short-story/application/ShortStoryProductionService";
import { storyScene3dMarkerService } from "../application/StoryScene3dMarkerService";
import { storyScene3dEnvironmentAnalysisService } from "../application/StoryScene3dEnvironmentAnalysisService";
import {
  STORY_SCENE_3D_ENVIRONMENT_LIMITS,
  STORY_SCENE_3D_ENVIRONMENT_LEGACY_DIAMETER_LIMITS,
} from "@ai-novel/shared/types/comicDrama";
import { llmProviderSchema } from "../../../../llm/providerSchema";

const novelParams = z.object({ id: z.string().trim().min(1) });
const sceneParams = z.object({ id: z.string().trim().min(1), sceneId: z.string().trim().min(1) });
const sceneStateParams = z.object({
  id: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  stateId: z.string().trim().min(1),
});
const propParams = z.object({ id: z.string().trim().min(1), propId: z.string().trim().min(1) });
const characterParams = z.object({ id: z.string().trim().min(1), characterId: z.string().trim().min(1) });
const stateImageParams = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["character", "scene", "prop"]),
  assetId: z.string().trim().min(1),
  stateId: z.string().trim().min(1),
});

const categorySchema = z.enum(["characters", "scenes", "props", "world"]);

// 资产外观状态：初始 + 换装/受伤/昼夜/损坏等变化态（生图/配音提示词随状态走）。
// image 是「生成图」按钮写入的产物（服务端生成后随 statesJson 持久化），客户端
// 保存时原样带回——schema 必须放行，否则编辑弹窗一保存就把已生成的图丢掉。
// prompt 上限要容得下服务端生成的完整生图提示词（角色四视图单次生图模板
// 固定文案就 2500+ 字，加角色资料与风格行可达 5000+）；写入侧 pruneStateImage
// 同步截断到同一上限，保证「服务端写入的必然能被客户端带回」。
const assetStateImageSchema = z.object({
  status: z.enum(["idle", "generating", "done", "error"]),
  artifactId: z.string().trim().max(160).optional(),
  url: z.string().max(600).optional(),
  prompt: z.string().max(6000).optional(),
  provider: z.string().max(60).optional(),
  generatedAt: z.string().max(60).optional(),
  error: z.string().max(600).optional(),
});

const assetStateVoiceSchema = z.object({
  status: z.enum(["idle", "generating", "done", "error"]),
  mode: z.enum(["reuse_previous", "generate_new"]),
  sourceStateId: z.string().trim().max(60).nullable().optional(),
  // 试听音频以 data URL 保存，限制单条状态的载荷，避免误传超大文件。
  sampleAudioUrl: z.string().max(5_000_000).optional(),
  prompt: z.string().max(400).optional(),
  generatedAt: z.string().max(60).optional(),
  error: z.string().max(600).optional(),
}).strict();

const scene3dMarkerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  kind: z.enum(["bed", "table", "chair", "sofa", "desk", "cabinet", "shelf", "door", "window", "counter", "stair", "other"]),
  label: z.string().trim().min(1).max(80),
  anchor: z.enum(["floor", "wall", "ceiling"]),
  position: z.tuple([
    z.number().min(-50).max(50),
    z.number().min(0).max(30),
    z.number().min(-50).max(50),
  ]),
  size: z.tuple([
    z.number().min(0.05).max(30),
    z.number().min(0.05).max(30),
    z.number().min(0.05).max(30),
  ]),
  yawDeg: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  imageRegion: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }).optional(),
  evidence: z.string().trim().max(240).optional(),
  source: z.enum(["ai", "manual"]).optional(),
}).strict();

const storyScene3dEnvironmentSchema = z.object({
  projectionCenterHeight: z
    .number()
    .min(STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.min)
    .max(STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeight.max),
  // 旧快照的比例仍允许进入兼容层；新 radiusMeters 输入由归一化器约束为 10%–40%。
  projectionCenterHeightRatio: z
    .number()
    .min(0.05)
    .max(0.4)
    .optional(),
  radiusMeters: z
    .number()
    .min(STORY_SCENE_3D_ENVIRONMENT_LIMITS.radiusMeters.min)
    .max(STORY_SCENE_3D_ENVIRONMENT_LIMITS.radiusMeters.max)
    .optional(),
  // 历史 domeRadius 表示直径；这里放行旧数据，写回时统一转换为 radiusMeters。
  domeRadius: z
    .number()
    .min(STORY_SCENE_3D_ENVIRONMENT_LEGACY_DIAMETER_LIMITS.min)
    .max(100)
    .optional(),
  panoramaHorizonV: z
    .number()
    .min(STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.min)
    .max(STORY_SCENE_3D_ENVIRONMENT_LIMITS.panoramaHorizonV.max)
    .optional(),
}).strict().superRefine((value, context) => {
  if (value.radiusMeters === undefined && value.domeRadius === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["radiusMeters"], message: "必须提供圆半径或历史半球直径" });
  }
  if (value.radiusMeters !== undefined && value.projectionCenterHeightRatio !== undefined
    && value.projectionCenterHeightRatio < STORY_SCENE_3D_ENVIRONMENT_LIMITS.projectionCenterHeightRatio.min) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectionCenterHeightRatio"], message: "当前圆半径的投射占比必须在 10% 到 40% 之间" });
  }
  if (value.radiusMeters === undefined && value.domeRadius !== undefined
    && value.projectionCenterHeightRatio !== undefined
    && value.projectionCenterHeightRatio > 0.2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["projectionCenterHeightRatio"], message: "历史半球直径的投射占比必须在 5% 到 20% 之间" });
  }
});

const scene3dMarkerSetSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["ready", "error", "stale"]),
  sourceImageArtifactId: z.string().trim().max(160).optional(),
  sourceImageGeneratedAt: z.string().max(80).optional(),
  sourceEnvironment: storyScene3dEnvironmentSchema.optional(),
  analyzedAt: z.string().max(80).optional(),
  analysisNote: z.string().max(500).optional(),
  error: z.string().max(600).optional(),
  markers: z.array(scene3dMarkerSchema).max(32),
}).strict();

const scene3dForegroundModelUsageSchema = z.object({
  supportSurface: z.enum(["ground", "wall", "ceiling", "horizontal-surface", "handheld", "free"]),
  placementMode: z.enum(["grounded", "wall-mounted", "ceiling-hung", "surface-placed", "handheld", "free"]),
  anchor: z.enum(["base", "back", "top", "support-center", "center"]),
  orientation: z.enum(["upright", "horizontal", "wall-facing", "downward", "directional", "free"]),
  requiresFacingDirection: z.boolean(),
  instruction: z.string().trim().max(300).optional(),
}).strict();

const scene3dForegroundModelSchema = z.object({
  id: z.string().trim().min(1).max(120),
  modelId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/),
  label: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(40),
  position: z.tuple([
    z.number().finite().min(-100).max(100),
    z.number().finite().min(0).max(50),
    z.number().finite().min(-100).max(100),
  ]),
  yawDeg: z.number().finite().min(-180).max(180),
  scale: z.number().finite().min(0.1).max(10),
  source: z.literal("model-library"),
  usage: scene3dForegroundModelUsageSchema.optional(),
}).strict();

const assetStateSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(24),
  description: z.string().trim().min(1).max(200),
  imagePrompt: z.string().trim().min(1).max(600),
  voicePrompt: z.string().trim().max(300).optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).optional(),
  // 场景的时间/天气/空间类型跟随状态保存；角色和道具不会使用这些字段。
  sceneType: z.enum(["interior", "exterior", "nature"]).nullable().optional(),
  timeOfDay: z.enum(["morning", "noon", "night"]).nullable().optional(),
  weather: z.enum(["sunny", "cloudy", "rainy"]).nullable().optional(),
  // 状态所处的时代风格（内置预设 label 或自定义风格名；空＝按剧情自动判定），生成状态图时最优先。
  eraStyle: z.string().trim().max(40).nullable().optional(),
  chapterOrder: z.number().int().min(0).max(9999).optional(),
  // 生图参考：用同一资产的哪个状态的图当参考（空＝不参考直接生成）
  referenceStateId: z.string().trim().max(60).nullable().optional(),
  image: assetStateImageSchema.optional(),
  voice: assetStateVoiceSchema.optional(),
  scene3dMarkers: scene3dMarkerSetSchema.optional(),
  scene3dForegroundModels: z.array(scene3dForegroundModelSchema).max(32).optional(),
}).strict();

// 角色图片提示词可省略；服务端会根据状态变化、年龄和性别归一化生成。
// 身上状态标签（血迹/脏污/破损…）为角色状态专用：这里只做结构校验，旧版标签 id
// 与未知值由 normalizeStoryAssetStates 的 canonicalizeWearTags 迁移/过滤。
const characterAssetStateSchema = assetStateSchema.extend({
  imagePrompt: z.string().trim().max(600).optional(),
  heightMeters: z.number()
    .min(STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS)
    .max(STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS)
    .optional(),
  wearTags: z.array(z.string().trim().min(1).max(20)).max(8).optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).nullable().optional(),
  actorKind: z.enum(["human", "monster", "other", "unknown"]).nullable().optional(),
  bodyBuild: z.enum(["slender", "standard", "broad", "unknown"]).nullable().optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).nullable().optional(),
  physique: z.string().trim().max(200).nullable().optional(),
  attireStyle: z.string().trim().max(400).nullable().optional(),
  facePrompt: z.string().trim().max(600).nullable().optional(),
  voiceTexture: z.string().trim().max(400).nullable().optional(),
  personality: z.string().trim().max(1200).nullable().optional(),
  appearance: z.string().trim().max(1200).nullable().optional(),
  background: z.string().trim().max(2000).nullable().optional(),
  // 别名/昵称列表（如 哥哥、晨哥）：解析与匹配按别名归一到本名；null/空数组清空。
  aliases: z.array(z.string().trim().min(1).max(40)).max(12).nullable().optional(),
  states: z.array(characterAssetStateSchema).max(24).optional(),
});

const worldMapKindSchema = z.enum(["country", "city", "region", "building", "wild", "other"]);
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
  nodes: z.array(worldMapNodeUpdateSchema).max(48).optional(),
  edges: z.array(worldMapEdgeUpdateSchema).max(48).optional(),
  childMaps: z.record(z.string().trim().min(1).max(60), worldMapUpdateSchema).optional(),
}).strict());

const worldUpdateSchema = z.object({
  premise: z.string().trim().min(1).max(1200).optional(),
  era: z.string().trim().max(200).nullable().optional(),
  toneRules: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  keySettings: z.array(z.object({
    title: z.string().trim().min(1).max(60),
    content: z.string().trim().min(1).max(1000),
  }).strict()).max(200).optional(),
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
  actorKind: z.enum(["human", "monster", "other", "unknown"]).optional(),
  bodyBuild: z.enum(["slender", "standard", "broad", "unknown"]).optional(),
  ageGroup: z.enum(["child", "youth", "middle", "elder"]).optional(),
  physique: z.string().trim().max(200).optional(),
  attireStyle: z.string().trim().max(400).optional(),
  facePrompt: z.string().trim().max(600).optional(),
  voiceTexture: z.string().trim().max(400).optional(),
  personality: z.string().trim().max(1200).optional(),
  appearance: z.string().trim().max(1200).optional(),
  background: z.string().trim().max(2000).optional(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  states: z.array(characterAssetStateSchema).max(24).optional(),
});

const sceneCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sceneType: z.enum(["interior", "exterior", "nature"]).optional(),
  summary: z.string().trim().max(600).optional(),
  environmentPrompt: z.string().trim().max(1200).optional(),
  significance: z.string().trim().max(600).optional(),
  timeOfDay: z.enum(["morning", "noon", "night"]).optional(),
  weather: z.enum(["sunny", "cloudy", "rainy"]).optional(),
  mapNodeId: z.string().trim().max(60).optional(),
  states: z.array(assetStateSchema).max(24).optional(),
  scene3dEnvironment: storyScene3dEnvironmentSchema.nullable().optional(),
});

const sceneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sceneType: z.enum(["interior", "exterior", "nature"]).nullable().optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  environmentPrompt: z.string().trim().max(1200).nullable().optional(),
  significance: z.string().trim().max(600).nullable().optional(),
  timeOfDay: z.enum(["morning", "noon", "night"]).nullable().optional(),
  weather: z.enum(["sunny", "cloudy", "rainy"]).nullable().optional(),
  mapNodeId: z.string().trim().max(60).nullable().optional(),
  states: z.array(assetStateSchema).max(24).optional(),
  scene3dEnvironment: storyScene3dEnvironmentSchema.nullable().optional(),
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

// 图片提示词微调：纯文本改写，不依赖已保存的资产（新建未落库也能用）。
const stateImagePromptTweakSchema = z.object({
  kind: z.enum(["character", "scene", "prop"]),
  assetName: z.string().trim().max(60).optional(),
  stateLabel: z.string().trim().max(60).optional(),
  imagePrompt: z.string().trim().max(600).optional(),
  instruction: z.string().trim().min(1).max(300),
}).strict();

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

  router.get("/:id/settings/scenes/:sceneId", validate({ params: sceneParams }), async (req, res, next) => {
    try {
      const data = await storySettingsService.getScene(
        String(req.params.id),
        String(req.params.sceneId),
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/settings/scenes/:sceneId/states/:stateId/3d-markers/analyze",
    validate({
      params: sceneStateParams,
      body: z.object({
        provider: llmProviderSchema.optional(),
        model: z.string().trim().max(160).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }).strict().default({}),
    }),
    async (req, res, next) => {
      try {
        const data = await storyScene3dMarkerService.analyzeSceneState(
          String(req.params.id),
          String(req.params.sceneId),
          String(req.params.stateId),
          req.body,
        );
        res.json({ success: true, data, message: "场景空间标记已识别。" } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/scenes/:sceneId/states/:stateId/3d-environment/analyze",
    validate({
      params: sceneStateParams,
      body: z.object({
        provider: llmProviderSchema.optional(),
        model: z.string().trim().max(160).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }).strict().default({}),
    }),
    async (req, res, next) => {
      try {
        const data = await storyScene3dEnvironmentAnalysisService.analyzeSceneState(
          String(req.params.id),
          String(req.params.sceneId),
          String(req.params.stateId),
          req.body,
        );
        res.json({ success: true, data, message: "场景 3D 环境已自动分析。" } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

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

  // 兼容旧版场景全景图接口（正式场景图片走状态图接口）
  router.post("/:id/settings/scenes/:sceneId/generate-image", validate({ params: sceneParams }), async (req, res, next) => {
    try {
      const data = await storyAssetImageService.generateSceneImage(
        String(req.params.id),
        String(req.params.sceneId),
        (req.body as { provider?: string } | undefined)?.provider,
      );
      res.json({ success: true, data, message: "兼容场景全景图已生成。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  // 服务旧版场景全景图文件
  router.get("/:id/settings/scenes/:sceneId/image", validate({ params: sceneParams }), async (req, res, next) => {
    try {
      const { filePath, mimeType } = await storyAssetImageService.serveSceneImage(String(req.params.id), String(req.params.sceneId));
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const { createReadStream } = await import("fs");
      createReadStream(filePath).pipe(res);
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

  // 生成道具 45° 透视参考图
  router.post("/:id/settings/props/:propId/generate-image", validate({ params: propParams }), async (req, res, next) => {
    try {
      const data = await storyAssetImageService.generatePropImage(
        String(req.params.id),
        String(req.params.propId),
        (req.body as { provider?: string } | undefined)?.provider,
      );
      res.json({ success: true, data, message: "道具图片已生成。" } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  // 服务道具图片文件
  router.get("/:id/settings/props/:propId/image", validate({ params: propParams }), async (req, res, next) => {
    try {
      const { filePath, mimeType } = await storyAssetImageService.servePropImage(String(req.params.id), String(req.params.propId));
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const { createReadStream } = await import("fs");
      createReadStream(filePath).pipe(res);
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

  // AI 场景标注：把未放置的场景资产摆到单层地图上（直接落库），无法定位的场景标记 unmappable。
  router.post("/:id/settings/world/map-annotate", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await worldMapService.annotateWorldMap(String(req.params.id));
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

  // 状态图片生成：仅当状态显式配置了 referenceStateId 才取同一资产另一状态的图当参考，
  // 默认不带任何参考、直接生成全新形象；返回更新后的资产（与列表接口同形），前端据此刷新缓存与编辑弹窗里的缩略图。
  // 终止接口（cancel-image，2026-08-23 用户要求）：生成中可手动停止——中止在跑的
  // 请求并写回可重试的 error 态，服务重启残留的僵尸 generating 也一并修复。
  router.post(
    "/:id/settings/characters/:characterId/states/:stateId/cancel-image",
    validate({ params: z.object({ id: novelParams.shape.id, characterId: characterParams.shape.characterId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, characterId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.cancelStateImage(id, "character", characterId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/characters/:characterId/states/:stateId/dismiss-image-error",
    validate({
      params: z.object({ id: novelParams.shape.id, characterId: characterParams.shape.characterId, stateId: z.string().trim().min(1) }),
      body: z.object({
        error: z.string().min(1).max(600),
        attemptId: z.string().trim().min(1).max(120).optional(),
      }).strict(),
    }),
    async (req, res, next) => {
      try {
        const { id, characterId, stateId } = req.params as Record<string, string>;
        const { error, attemptId } = req.body as { error: string; attemptId?: string };
        const data = await storyAssetStateImageService.dismissStateImageError(id, "character", characterId, stateId, error, attemptId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/characters/:characterId/states/:stateId/generate-image",
    validate({ params: z.object({ id: novelParams.shape.id, characterId: characterParams.shape.characterId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, characterId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.generateStateImage(id, "character", characterId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/characters/:characterId/states/:stateId/generate-voice",
    validate({
      params: z.object({
        id: novelParams.shape.id,
        characterId: characterParams.shape.characterId,
        stateId: z.string().trim().min(1),
      }),
      body: z.object({
        mode: z.enum(["reuse_previous", "generate_new"]).optional(),
        // 选取音色：显式指定复用哪个状态的音色（不填则按参考链找上一状态）
        sourceStateId: z.string().trim().min(1).optional(),
      }).strict(),
    }),
    async (req, res, next) => {
      try {
        const { id, characterId, stateId } = req.params as Record<string, string>;
        const body = req.body as { mode?: "reuse_previous" | "generate_new"; sourceStateId?: string };
        const data = await storyAssetStateVoiceService.generateStateVoice(id, characterId, stateId, body.mode, body.sourceStateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/scenes/:sceneId/states/:stateId/cancel-image",
    validate({ params: z.object({ id: novelParams.shape.id, sceneId: sceneParams.shape.sceneId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, sceneId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.cancelStateImage(id, "scene", sceneId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/scenes/:sceneId/states/:stateId/dismiss-image-error",
    validate({
      params: z.object({ id: novelParams.shape.id, sceneId: sceneParams.shape.sceneId, stateId: z.string().trim().min(1) }),
      body: z.object({
        error: z.string().min(1).max(600),
        attemptId: z.string().trim().min(1).max(120).optional(),
      }).strict(),
    }),
    async (req, res, next) => {
      try {
        const { id, sceneId, stateId } = req.params as Record<string, string>;
        const { error, attemptId } = req.body as { error: string; attemptId?: string };
        const data = await storyAssetStateImageService.dismissStateImageError(id, "scene", sceneId, stateId, error, attemptId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/scenes/:sceneId/states/:stateId/generate-image",
    validate({ params: z.object({ id: novelParams.shape.id, sceneId: sceneParams.shape.sceneId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, sceneId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.generateStateImage(id, "scene", sceneId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/props/:propId/states/:stateId/cancel-image",
    validate({ params: z.object({ id: novelParams.shape.id, propId: propParams.shape.propId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, propId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.cancelStateImage(id, "prop", propId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/props/:propId/states/:stateId/dismiss-image-error",
    validate({
      params: z.object({ id: novelParams.shape.id, propId: propParams.shape.propId, stateId: z.string().trim().min(1) }),
      body: z.object({
        error: z.string().min(1).max(600),
        attemptId: z.string().trim().min(1).max(120).optional(),
      }).strict(),
    }),
    async (req, res, next) => {
      try {
        const { id, propId, stateId } = req.params as Record<string, string>;
        const { error, attemptId } = req.body as { error: string; attemptId?: string };
        const data = await storyAssetStateImageService.dismissStateImageError(id, "prop", propId, stateId, error, attemptId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/settings/props/:propId/states/:stateId/generate-image",
    validate({ params: z.object({ id: novelParams.shape.id, propId: propParams.shape.propId, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        const { id, propId, stateId } = req.params as Record<string, string>;
        const data = await storyAssetStateImageService.generateStateImage(id, "prop", propId, stateId);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  /** POST /api/novels/:id/settings/state-image-prompt/tweak —— 按小改动指令 AI 微调状态图片提示词 */
  router.post(
    "/:id/settings/state-image-prompt/tweak",
    validate({ params: novelParams, body: stateImagePromptTweakSchema }),
    async (req, res, next) => {
      try {
        const data = await storyStateImagePromptService.tweakStateImagePrompt(String(req.params.id), req.body);
        res.json({ success: true, data } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  /** GET /api/novels/:id/settings/state-images/:kind/:assetId/:stateId —— 资产归属明确的状态图文件 */
  router.get(
    "/:id/settings/state-images/:kind/:assetId/:stateId",
    validate({ params: stateImageParams }),
    async (req, res, next) => {
      try {
        const { id, kind, assetId, stateId } = req.params as {
          id: string;
          kind: "character" | "scene" | "prop";
          assetId: string;
          stateId: string;
        };
        const resolved = await storyAssetStateImageService.resolveStateImagePath(id, kind, assetId, stateId);
        if (!resolved) {
          res.status(404).json({ success: false, message: "该状态还没有生成图片。" });
          return;
        }
        res.setHeader("Content-Type", resolved.mimeType);
        // URL 稳定但当前 artifactId 会变化，不能缓存旧 generation 一整天。
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        fs.createReadStream(resolved.filePath).pipe(res);
      } catch (error) {
        next(error);
      }
    },
  );

  /** GET /api/novels/:id/settings/state-images/:stateId —— 旧 URL 仅保留为迁移提示，不再返回共享文件 */
  router.get(
    "/:id/settings/state-images/:stateId",
    validate({ params: z.object({ id: novelParams.shape.id, stateId: z.string().trim().min(1) }) }),
    async (req, res, next) => {
      try {
        res.status(410).json({
          success: false,
          message: "该图片链接已失效，请通过资产所属的状态图片链接访问。",
        });
      } catch (error) {
        next(error);
      }
    },
  );

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
