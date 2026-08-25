import fs from "fs";
import path from "path";
import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { prisma } from "../../../db/prisma";
import { dramaCharacterImageService } from "../../../services/drama/DramaCharacterImageService";
import { dramaCharacterService } from "../../../services/drama/DramaCharacterService";
import { dramaComplianceService } from "../../../services/drama/DramaComplianceService";
import { dramaEpisodeService } from "../../../services/drama/DramaEpisodeService";
import { dramaEpisodeOutlineService } from "../../../services/drama/DramaEpisodeOutlineService";
import { dramaExportService } from "../../../services/drama/DramaExportService";
import { dramaGuidanceService } from "../../../services/drama/guidance/DramaGuidanceService";
import { dramaProjectService } from "../../../services/drama/DramaProjectService";
import { resolveNovelEraStyleOverview } from "../../../services/drama/visual/dramaArtStyleResolver";
import { getDramaEraStyleCustoms, saveDramaEraStyleLibrary } from "../../../services/drama/visual/eraStyleLibrary";
import { getSharedNovelServices } from "../../../services/novel/application/sharedNovelServices";
import { dramaQualityGate } from "../../../services/drama/DramaQualityGate";
import { dramaRepairService } from "../../../services/drama/DramaRepairService";
import { dramaScriptService } from "../../../services/drama/DramaScriptService";
import { dramaStoryboardService } from "../../../services/drama/DramaStoryboardService";
import { comicDramaStudioService } from "../../../services/drama/studio/ComicDramaStudioService";
import { dramaStrategyService } from "../../../services/drama/DramaStrategyService";
import { dramaVideoPromptService } from "../../../services/drama/DramaVideoPromptService";
import { ttsProviderRegistry } from "../../../services/drama/audio/TTSProviderPort";
import { dramaAudioSegmentsService } from "../../../services/drama/audio/DramaAudioSegmentsService";
import { dramaDialogueAudioService } from "../../../services/drama/audio/DramaDialogueAudioService";
import { dramaVoiceDesignService } from "../../../services/drama/audio/DramaVoiceDesignService";
import {
  listIndexTTS25Catalog,
  persistIndexTTS25ReferenceAudio,
} from "../../../services/audio/indexTTS25";
import { resolveAudioSpeechSlotConfig } from "../../../services/audio/speechProvider";
import { rhythmEngine } from "../../../services/drama/engine/rhythmEngine";
import { dramaBatchOrchestrator } from "../../../services/drama/production/DramaBatchOrchestrator";
import { dramaShotKeyframeService } from "../../../services/drama/visual/DramaShotKeyframeService";
import { dramaShotBlockingSketchService } from "../../../services/drama/visual/DramaShotBlockingSketchService";
import { DRAMA_VISUAL_STYLE_PRESETS } from "../../../services/drama/visual/dramaVisualStyles";
import { dramaVideoFilePath } from "../../../services/drama/video/LocalFfmpegVideoProvider";
import { dramaEpisodeAssemblyService } from "../../../services/drama/video/DramaEpisodeAssemblyService";
import { resolveDefaultVideoProvider, videoProviderRegistry } from "../../../services/drama/video/VideoProviderPort";
import { comicDramaStoryboardBridgeService } from "../../../services/drama/studio/ComicDramaStoryboardBridgeService";

const router = Router();

const llmOptionsSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const imageProviderBodySchema = z
  .object({
    provider: z.string().trim().optional(),
    useCharacterRefImages: z.boolean().optional(),
    promptOverride: z.string().trim().max(4000).optional(),
    providerOverride: z.string().trim().optional(),
    sizeOverride: z.string().trim().max(20).optional(),
    negativePromptOverride: z.string().trim().max(2000).optional(),
    excludedReferenceImageUrls: z.array(z.string().trim().min(1).max(1000)).max(24).optional(),
  })
  .optional();

const blockingSketchSceneSchema = z.object({
  assetId: z.string().trim().min(1).max(120),
  stateId: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().min(1).max(1200),
  yawDeg: z.number().min(-180).max(180),
  pitchDeg: z.number().min(-60).max(60),
  fovDeg: z.number().min(40).max(100),
});

const blockingSketchActorSchema = z.object({
  characterName: z.string().trim().min(1).max(120),
  assetId: z.string().trim().min(1).max(120).optional(),
  stateId: z.string().trim().min(1).max(120).optional(),
  imageUrl: z.string().trim().min(1).max(1200).optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.08).max(2),
  flipX: z.boolean(),
  zIndex: z.number().int().min(0).max(99),
});

const blockingSketch3dPoseSchema = z.enum([
  "standing",
  "talking",
  "arms_crossed",
  "sitting",
  "crouching",
  "kneeling",
  "lying",
  "prone",
  "walking",
  "running",
  "pointing",
  "holding",
  "interacting",
  "fighting",
  "sword",
]);

const blockingSketch3dCameraSchema = z.object({
  azim: z.number().min(-180).max(180),
  elev: z.number().min(-89).max(89),
  distance: z.number().min(0.25).max(100),
  focalPoint: z.tuple([
    z.number().min(-100).max(100),
    z.number().min(-100).max(100),
    z.number().min(-100).max(100),
  ]),
  fovDeg: z.number().min(30).max(100).optional().default(52),
  nearClip: z.number().min(0.05).max(5).optional().default(0.05),
  farClip: z.number().min(20).max(300).optional().default(200),
  depthOfFieldEnabled: z.boolean().optional().default(false),
  focusDistance: z.number().min(0.25).max(100).optional().default(8),
  focusRange: z.number().min(0.1).max(100).optional().default(5),
  blurRadius: z.number().min(0).max(10).optional().default(3),
});

const blockingSketch3dActorSchema = z.object({
  characterName: z.string().trim().min(1).max(120),
  position: z.tuple([
    z.number().min(-100).max(100),
    z.number().min(0).max(50),
    z.number().min(-100).max(100),
  ]),
  yawDeg: z.number().min(-180).max(180),
  scale: z.tuple([
    z.number().min(0.1).max(10),
    z.number().min(0.1).max(10),
    z.number().min(0.1).max(10),
  ]),
  pose: blockingSketch3dPoseSchema,
  actionPlaying: z.boolean(),
});

const blockingSketch3dEnvironmentSchema = z.object({
  projectionCenterHeight: z.number().min(0.6).max(10),
  domeRadius: z.number().min(10).max(100),
  yawDeg: z.number().min(-180).max(180),
  intensity: z.number().min(0.6).max(1.6),
});

const blockingSketch3dLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  engine: z.literal("playcanvas"),
  camera: blockingSketch3dCameraSchema,
  actors: z.array(blockingSketch3dActorSchema).max(12),
  environment: blockingSketch3dEnvironmentSchema.optional(),
});

const blockingSketchDataSchema = z.object({
  status: z.enum(["draft", "confirmed"]),
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  url: z.string().trim().min(1).max(1200).optional(),
  generatedAt: z.string().trim().min(1).max(100).optional(),
  scene: blockingSketchSceneSchema,
  actors: z.array(blockingSketchActorSchema).max(12),
  layout3d: blockingSketch3dLayoutSchema.optional(),
});

const blockingSketchSaveSchema = z.object({
  data: blockingSketchDataSchema,
});

const batchJobBodySchema = z.object({
  type: z.enum(["keyframes", "videos", "tts"]),
  provider: z.string().trim().optional(),
  shotIds: z.array(z.string().trim().min(1)).optional(),
  failedShotIds: z.array(z.string().trim().min(1)).optional(),
  useCharacterRefImages: z.boolean().optional(),
  /** keyframes/tts 强制重生成：忽略已有首帧或配音 */
  force: z.boolean().optional(),
});

const shotAudioRegenerateSchema = z.object({
  force: z.boolean().optional(),
});

const narratorVoiceUpdateSchema = z.object({
  description: z.string().trim().min(4).max(1000),
  referenceAudioUrl: z.string().trim().max(14_000_000).nullable().optional(),
  indexTTS25Speaker: z.string().trim().max(120).optional(),
});

const characterVoiceDesignSchema = z.object({
  prompt: z.string().trim().min(4).max(1000),
  referenceAudioUrl: z.string().trim().max(14_000_000).nullable().optional(),
  indexTTS25Speaker: z.string().trim().max(120).optional(),
});

const characterVoiceSourceUpdateSchema = z.object({
  referenceAudioUrl: z.string().trim().max(14_000_000).nullable().optional(),
  indexTTS25Speaker: z.string().trim().max(120).optional(),
});

const indexTTS25ReferenceUploadSchema = z.object({
  audioDataUrl: z.string()
    .trim()
    .max(14_000_000)
    .refine((value) => /^data:audio\//i.test(value), "请上传音频文件。"),
});

const outlineRequestSchema = z
  .object({
    startOrder: z.number().int().min(1).optional(),
    count: z.number().int().min(1).max(40).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const idParamsSchema = z.object({ id: z.string().trim().min(1) });
// 按小说删除漫剧项目的路由参数是 :novelId，与通用的 :id schema 不同名，必须单独校验。
const novelRefParamsSchema = z.object({ novelId: z.string().trim().min(1) });
const episodeParamsSchema = z.object({
  id: z.string().trim().min(1),
  order: z.coerce.number().int().min(1),
});
const characterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});
const storyboardParamsSchema = z.object({ storyboardId: z.string().trim().min(1) });
const shotParamsSchema = z.object({
  id: z.string().trim().min(1),
  shotId: z.string().trim().min(1),
});
const shotUpdateSchema = z.object({
  action: z.string().trim().max(1000).optional(),
  dialogue: z.string().trim().max(500).optional(),
  shotSize: z.string().trim().max(40).optional(),
  cameraMove: z.string().trim().max(40).optional(),
  location: z.string().trim().max(40).optional(),
  durationSec: z.number().int().min(1).max(60).optional(),
});
const videoPromptParamsSchema = z.object({ videoPromptId: z.string().trim().min(1) });
const shotImageParamsSchema = z.object({ shotId: z.string().trim().min(1) });
const shotImageVersionParamsSchema = z.object({
  shotId: z.string().trim().min(1),
  version: z.string().trim().regex(/^v?\d+$/),
});

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  source: z.enum(["novel_import", "original", "text_import"]),
  sourceRef: z.string().trim().min(1).optional(),
  track: z.string().trim().max(40).optional(),
  theme: z.string().trim().max(120).optional(),
  targetEpisodes: z.number().int().min(1).max(500).optional(),
  visualStyle: z.string().trim().max(60).optional(),
  inspiration: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(200000).optional(),
});

const repairRequestSchema = z
  .object({
    instruction: z.string().trim().max(4000).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const episodeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(200000).optional(),
  hookOpening: z.string().trim().max(1000).nullable().optional(),
  cliffhanger: z.string().trim().max(1000).nullable().optional(),
  durationSec: z.number().int().min(1).max(600).nullable().optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  archetype: z.string().trim().max(80).optional(),
  persona: z.string().trim().max(1000).optional(),
  speechStyle: z.string().trim().max(1000).optional(),
  visualAnchor: z.unknown().optional(),
  voiceProfile: z.unknown().optional(),
  relations: z.unknown().optional(),
});

const saveCharacterSchema = z
  .object({
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .optional();

const importCharacterSchema = z.object({
  libraryId: z.string().trim().min(1),
});

const providerTaskSchema = z
  .object({
    provider: z.string().trim().min(1).optional(),
  })
  .optional();

const trackRecommendationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import"]),
  sourceDigest: z.string().trim().max(20000).optional(),
  theme: z.string().trim().max(120).optional(),
  targetEpisodes: z.number().int().min(1).max(500).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const sourceSupplementSchema = z
  .object({
    userSupplement: z.string().trim().max(8000).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

// 漫剧 studio：小说阶段 + drama 分镜管线的阶段投影（编排层，只读）。
const studioLinksQuerySchema = z.object({
  novelIds: z.string().trim().min(1).max(4000),
});
const studioOverviewParamsSchema = z.object({ novelId: z.string().trim().min(1) });
const studioStoryboardParamsSchema = z.object({
  novelId: z.string().trim().min(1),
  order: z.coerce.number().int().min(1),
});
const studioStoryboardBodySchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    visualStyle: z.string().trim().max(60).optional(),
  })
  .optional();

router.get("/studio/links", validate({ query: studioLinksQuerySchema }), async (req, res, next) => {
  try {
    const novelIds = String(req.query.novelIds ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50);
    const data = await comicDramaStudioService.getLinks(novelIds);
    res.status(200).json({ success: true, data, message: "Comic drama links loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/studio/:novelId/overview", validate({ params: studioOverviewParamsSchema }), async (req, res, next) => {
  try {
    const data = await comicDramaStudioService.getOverview(String(req.params.novelId));
    res.status(200).json({ success: true, data, message: "Comic drama studio overview loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/studio/:novelId/chapters/:order/storyboard",
  validate({ params: studioStoryboardParamsSchema, body: studioStoryboardBodySchema }),
  async (req, res, next) => {
    try {
      const { novelId, order } = req.params as unknown as z.infer<typeof studioStoryboardParamsSchema>;
      const data = await comicDramaStoryboardBridgeService.generateStoryboardFromNovelChapter(
        novelId,
        order,
        (req.body ?? {}) as never,
      );
      res.status(200).json({ success: true, data, message: "当前章节分镜已生成。" });
    } catch (error) {
      next(error);
    }
  },
);

/** GET /api/drama/visual-styles — 时代画风选项：内置预设 + 全局自定义（2026-08-22 起自定义并入）。 */
router.get("/visual-styles", async (_req, res, next) => {
  try {
    const customs = await getDramaEraStyleCustoms();
    const data = [
      ...DRAMA_VISUAL_STYLE_PRESETS,
      ...customs.map((style) => ({
        id: style.label,
        label: style.label,
        summary: style.prompt.slice(0, 40),
        styleTag: "",
        styleFamily: "custom" as const,
      })),
    ];
    res.status(200).json({
      success: true,
      data,
      message: "Visual styles loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/era-styles — 全局自定义时代画风清单（画风管理页编辑用，含完整提示词）。 */
router.get("/era-styles", async (_req, res, next) => {
  try {
    const customs = await getDramaEraStyleCustoms();
    res.status(200).json({
      success: true,
      data: { styles: customs },
      message: "时代画风读取成功。",
    } satisfies ApiResponse<{ styles: typeof customs }>);
  } catch (error) {
    next(error);
  }
});

const eraStyleLibrarySaveSchema = z.object({
  styles: z.array(z.object({
    label: z.string().trim().min(1).max(20),
    prompt: z.string().trim().min(1).max(500),
  }).strict()).max(24),
}).strict();

/** PUT /api/drama/era-styles — 保存整份全局自定义时代画风（全量替换；内置预设不可改）。 */
router.put("/era-styles", validate({ body: eraStyleLibrarySaveSchema }), async (req, res, next) => {
  try {
    const { styles } = req.body as z.infer<typeof eraStyleLibrarySaveSchema>;
    const customs = await saveDramaEraStyleLibrary(styles);
    res.status(200).json({
      success: true,
      data: { styles: customs },
      message: "时代画风已保存。",
    } satisfies ApiResponse<{ styles: typeof customs }>);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/era-style/:novelId — 小说当前生效的时代风格（脚本标记 > 小说默认 > 内置） */
router.get("/era-style/:novelId", validate({ params: novelRefParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof novelRefParamsSchema>;
    const overview = await resolveNovelEraStyleOverview(novelId);
    res.status(200).json({
      success: true,
      data: overview,
      message: "时代风格读取成功。",
    } satisfies ApiResponse<typeof overview>);
  } catch (error) {
    next(error);
  }
});

const visualStyleUpdateSchema = z.object({
  styleId: z.string().trim().max(60).nullable(),
});

/** POST /api/drama/projects/:id/visual-style — 设置/更新项目画面风格 */
router.post("/projects/:id/visual-style", validate({ params: idParamsSchema, body: visualStyleUpdateSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const { styleId } = req.body as z.infer<typeof visualStyleUpdateSchema>;
    const normalized = styleId?.trim() || null;
    // 项目画风引用全局时代画风库：内置预设 id 或全局自定义风格名（2026-08-22 起）。
    if (normalized && !DRAMA_VISUAL_STYLE_PRESETS.some((preset) => preset.id === normalized)) {
      const customs = await getDramaEraStyleCustoms();
      if (!customs.some((style) => style.label === normalized)) {
        res.status(400).json({ success: false, message: "未知的画面风格。" });
        return;
      }
    }
    const project = await prisma.dramaProject.update({
      where: { id },
      data: { visualStyle: normalized },
      select: { id: true, visualStyle: true },
    });
    res.status(200).json({ success: true, data: project, message: "画面风格已更新。" } satisfies ApiResponse<typeof project>);
  } catch (error) {
    next(error);
  }
});

const videoFileParamsSchema = z.object({ fileId: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/) });

/** GET /api/drama/video-files/:fileId — 本地合成视频产物 */
router.get("/video-files/:fileId", validate({ params: videoFileParamsSchema }), async (req, res, next) => {
  try {
    const { fileId } = req.params as unknown as z.infer<typeof videoFileParamsSchema>;
    const filePath = dramaVideoFilePath(fileId);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: "视频尚未生成完成。" });
      return;
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/subtitle-files/:fileId — 整集合成字幕（.srt）产物 */
router.get("/subtitle-files/:fileId", validate({ params: videoFileParamsSchema }), async (req, res, next) => {
  try {
    const { fileId } = req.params as unknown as z.infer<typeof videoFileParamsSchema>;
    const filePath = dramaVideoFilePath(fileId).replace(/\.mp4$/, ".srt");
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: "字幕文件不存在。" });
      return;
    }
    res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileId}.srt"`);
    fs.createReadStream(filePath, "utf8").pipe(res);
  } catch (error) {
    next(error);
  }
});

router.get("/projects", async (_req, res, next) => {
  try {
    const data = await dramaProjectService.listProjects();
    res.status(200).json({ success: true, data, message: "Drama projects loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects", validate({ body: createProjectSchema }), async (req, res, next) => {
  try {
    const data = await dramaProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
    res.status(201).json({ success: true, data, message: "Drama project created." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaProjectService.getProject(id);
    if (!data) {
      res.status(404).json({ success: false, error: "Drama project not found." } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({ success: true, data, message: "Drama project loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/source-bundle", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaProjectService.assembleSourceBundle(id);
    res.status(200).json({ success: true, data, message: "Drama source bundle assembled." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

// 漫剧项目删除：DramaProject 对小说是软引用（sourceRef，无外键级联），
// 必须先显式清理 drama 侧（分镜/配音/视频随项目级联），再删除小说本体（含 RAG 清理）。
// 两个 bounded context 的删除在 HTTP 叶子层编排，服务层保持互不依赖。
router.delete("/projects/by-novel/:novelId", validate({ params: novelRefParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof novelRefParamsSchema>;
    await dramaProjectService.deleteProjectsByNovelRef(novelId);
    await getSharedNovelServices().deleteNovel(novelId);
    res.status(200).json({ success: true, message: "漫剧项目已删除。" } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/projects/:id/source-supplement",
  validate({ params: idParamsSchema, body: sourceSupplementSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaGuidanceService.analyzeSourceSupplement(id, (req.body ?? {}) as never);
      res.status(200).json({ success: true, data, message: "Drama source supplement guidance generated." });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/tracks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listTracks(), message: "Drama tracks loaded." });
});

router.get("/hooks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listHooks(), message: "Drama hooks loaded." });
});

router.get("/video-providers", (_req, res) => {
  const data = videoProviderRegistry.listProviders();
  res.status(200).json({ success: true, data, message: "Drama video providers loaded." });
});

router.get("/tts-providers", (_req, res) => {
  const data = ttsProviderRegistry.listProviders();
  res.status(200).json({ success: true, data, message: "Drama TTS providers loaded." });
});

// ─── 配音（漫剧工作台配音阶段；分段显示模型沿自 mydrama voice-stage） ────────

router.get(
  "/projects/:id/episodes/:order/audio-segments",
  validate({ params: episodeParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
      const data = await dramaAudioSegmentsService.listEpisodeAudioSegments(id, order);
      res.status(200).json({ success: true, data, message: "Drama audio segments loaded." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/shots/:shotId/audio",
  validate({ params: shotParamsSchema, body: shotAudioRegenerateSchema }),
  async (req, res, next) => {
    try {
      const { shotId } = req.params as z.infer<typeof shotParamsSchema>;
      const body = req.body as z.infer<typeof shotAudioRegenerateSchema>;
      const data = await dramaDialogueAudioService.synthesizeShotDialogue(shotId, undefined, {
        force: body.force ?? false,
      });
      res.status(200).json({ success: true, data, message: "Drama shot dialogue audio generated." });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/projects/:id/narrator-voice", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaVoiceDesignService.getNarratorVoice(id);
    res.status(200).json({ success: true, data, message: "Drama narrator voice loaded." });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/projects/:id/narrator-voice",
  validate({ params: idParamsSchema, body: narratorVoiceUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = req.body as z.infer<typeof narratorVoiceUpdateSchema>;
      const data = await dramaVoiceDesignService.updateNarratorVoiceDescription(id, body.description, {
        referenceAudioUrl: body.referenceAudioUrl,
        indexTTS25Speaker: body.indexTTS25Speaker,
      });
      res.status(200).json({ success: true, data, message: "Drama narrator voice updated." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/narrator-voice/design",
  validate({ params: idParamsSchema, body: narratorVoiceUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = req.body as z.infer<typeof narratorVoiceUpdateSchema>;
      const data = await dramaVoiceDesignService.designNarratorVoice(id, body.description, {
        referenceAudioUrl: body.referenceAudioUrl,
        indexTTS25Speaker: body.indexTTS25Speaker,
      });
      res.status(200).json({ success: true, data, message: "Drama narrator voice sample generated." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/voice-design",
  validate({ params: characterParamsSchema, body: characterVoiceDesignSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as z.infer<typeof characterVoiceDesignSchema>;
      const data = await dramaVoiceDesignService.designCharacterVoice(characterId, body.prompt, {
        referenceAudioUrl: body.referenceAudioUrl,
        indexTTS25Speaker: body.indexTTS25Speaker,
      });
      res.status(200).json({ success: true, data, message: "Drama character voice sample generated." });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/projects/:id/characters/:characterId/voice-source",
  validate({ params: characterParamsSchema, body: characterVoiceSourceUpdateSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as z.infer<typeof characterVoiceSourceUpdateSchema>;
      const data = await dramaVoiceDesignService.updateCharacterVoiceSource(characterId, {
        referenceAudioUrl: body.referenceAudioUrl,
        indexTTS25Speaker: body.indexTTS25Speaker,
      });
      res.status(200).json({ success: true, data, message: "角色音色来源已保存。" });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/index-tts25/catalog", async (_req, res, next) => {
  try {
    const config = await resolveAudioSpeechSlotConfig({ provider: "indextts25" });
    const data = await listIndexTTS25Catalog(config.baseURL, config.timeoutMs);
    res.status(200).json({ success: true, data, message: "IndexTTS 2.5 音色目录读取成功。" });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/index-tts25/references",
  validate({ body: indexTTS25ReferenceUploadSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof indexTTS25ReferenceUploadSchema>;
      const fileName = await persistIndexTTS25ReferenceAudio(body.audioDataUrl);
      res.status(200).json({
        success: true,
        data: { fileName },
        message: "参考音频已加入 IndexTTS 2.5 音色库。",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/track-recommendation", validate({ body: trackRecommendationSchema }), async (req, res, next) => {
  try {
    const data = await dramaGuidanceService.recommendTrack(req.body as z.infer<typeof trackRecommendationSchema>);
    res.status(200).json({ success: true, data, message: "Drama track recommendation generated." });
  } catch (error) {
    next(error);
  }
});

router.get("/character-library", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const data = await dramaCharacterService.listLibrary(projectId);
    res.status(200).json({ success: true, data, message: "Drama character library loaded." });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/characters", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaCharacterService.listProjectCharacters(id);
    res.status(200).json({ success: true, data, message: "Drama characters loaded." });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/projects/:id/characters/:characterId",
  validate({ params: characterParamsSchema, body: characterUpdateSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterService.updateProjectCharacter(characterId, req.body);
      res.status(200).json({ success: true, data, message: "Drama character updated." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/save-to-library",
  validate({ params: characterParamsSchema, body: saveCharacterSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterService.saveCharacterToLibrary(characterId, req.body?.tags);
      res.status(201).json({ success: true, data, message: "Drama character saved to library." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/character-library/import",
  validate({ params: idParamsSchema, body: importCharacterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = req.body as z.infer<typeof importCharacterSchema>;
      const data = await dramaCharacterService.importLibraryCharacter(id, body.libraryId);
      res.status(201).json({ success: true, data, message: "Drama character imported." });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/projects/:id/strategy", validate({ params: idParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaStrategyService.generateStrategy(id, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama strategy generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/outline", validate({ params: idParamsSchema, body: outlineRequestSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const body = (req.body ?? {}) as { startOrder?: number; count?: number };
    const data = await dramaEpisodeOutlineService.generateOutline(
      id,
      { startOrder: body.startOrder, count: body.count },
      (req.body ?? {}) as never,
    );
    res.status(200).json({ success: true, data, message: "Drama episode outline generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/script", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaScriptService.generateEpisodeScript(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode script generated." });
  } catch (error) {
    next(error);
  }
});

router.patch("/projects/:id/episodes/:order", validate({ params: episodeParamsSchema, body: episodeUpdateSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaEpisodeService.updateEpisode(id, order, req.body as z.infer<typeof episodeUpdateSchema>);
    res.status(200).json({ success: true, data, message: "Drama episode updated." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/review", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaQualityGate.reviewEpisode(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode reviewed." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/compliance", validate({ params: idParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaComplianceService.checkProject(id, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama project compliance checked." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/compliance", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaComplianceService.checkEpisode(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode compliance checked." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/repair", validate({ params: episodeParamsSchema, body: repairRequestSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = (req.body ?? {}) as { instruction?: string };
    const data = await dramaRepairService.repairEpisode(id, order, body.instruction, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode repaired." });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/export", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const format = req.query.format === "json" ? "json" : "markdown";
    const data = await dramaExportService.exportProject(id, format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.status(200).send(data.body);
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/episodes/:order/export", validate({ params: episodeParamsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const format = req.query.format === "timeline-json" ? "timeline-json" : "srt";
    const data = await dramaExportService.exportEpisode(id, order, format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.status(200).send(data.body);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/batch-jobs", validate({ params: episodeParamsSchema, body: batchJobBodySchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = req.body as z.infer<typeof batchJobBodySchema>;
    const data = await dramaBatchOrchestrator.createEpisodeBatchJob(id, order, body);
    res.status(201).json({ success: true, data, message: "Drama batch job created." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/batch-jobs/estimate", validate({ params: episodeParamsSchema, body: batchJobBodySchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = req.body as z.infer<typeof batchJobBodySchema>;
    const data = await dramaBatchOrchestrator.estimateEpisodeBatchJob(id, order, body);
    res.status(200).json({ success: true, data, message: "Drama batch job cost estimate loaded." });
  } catch (error) {
    next(error);
  }
});

const assemblyBodySchema = z.object({
  /** 是否把字幕直接烧录进成片（默认 true，导出的 mp4 即可直接发布） */
  burnSubtitles: z.boolean().optional(),
  includeTitleCard: z.boolean().optional(),
  includeEndCard: z.boolean().optional(),
});

/** GET /api/drama/projects/:id/episodes/:order/assembly — 整集合成状态与素材就绪度 */
router.get("/projects/:id/episodes/:order/assembly", validate({ params: episodeParamsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaEpisodeAssemblyService.getAssemblyStatus(id, order);
    res.status(200).json({ success: true, data, message: "Drama episode assembly status loaded." });
  } catch (error) {
    next(error);
  }
});

/** POST /api/drama/projects/:id/episodes/:order/assembly — 启动整集合成（full_episode 任务） */
router.post("/projects/:id/episodes/:order/assembly", validate({ params: episodeParamsSchema, body: assemblyBodySchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = (req.body ?? {}) as z.infer<typeof assemblyBodySchema>;
    const data = await dramaEpisodeAssemblyService.startAssembly(id, order, body);
    res.status(201).json({ success: true, data, message: "整集合成已开始。" });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/storyboard", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaStoryboardService.generateStoryboard(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama storyboard generated." });
  } catch (error) {
    next(error);
  }
});

router.get("/storyboards/:storyboardId", validate({ params: storyboardParamsSchema }), async (req, res, next) => {
  try {
    const { storyboardId } = req.params as z.infer<typeof storyboardParamsSchema>;
    const data = await dramaStoryboardService.getStoryboard(storyboardId);
    res.status(200).json({ success: true, data, message: "Drama storyboard loaded." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/video-prompt", validate({ params: shotParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaVideoPromptService.generateVideoPromptForShot(id, shotId, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama video prompt generated." });
  } catch (error) {
    next(error);
  }
});

// 手动编辑镜头（台词/动作/景别/运镜/时长/场景）；台词改动后配音段按指纹自动标记过期
router.put("/projects/:id/shots/:shotId", validate({ params: shotParamsSchema, body: shotUpdateSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaStoryboardService.updateShot(id, shotId, req.body as never);
    res.status(200).json({ success: true, data, message: "镜头已更新。" });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/shots/:shotId/blocking-sketch", validate({ params: shotParamsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaShotBlockingSketchService.getEditorContext(id, shotId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put(
  "/projects/:id/shots/:shotId/blocking-sketch",
  validate({ params: shotParamsSchema, body: blockingSketchSaveSchema }),
  async (req, res, next) => {
    try {
      const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
      const { data: sketch } = req.body as z.infer<typeof blockingSketchSaveSchema>;
      const data = await dramaShotBlockingSketchService.saveSketch(id, shotId, sketch);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/shots/:shotId/blocking-sketch/auto-plan",
  validate({ params: shotParamsSchema, body: llmOptionsSchema }),
  async (req, res, next) => {
    try {
      const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
      const data = await dramaShotBlockingSketchService.autoPlan(id, shotId, (req.body ?? {}) as never);
      res.status(200).json({ success: true, data, message: "3D 草图构图已规划。" });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/projects/:id/shots/:shotId/blocking-sketch/image", validate({ params: shotParamsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const data = await dramaShotBlockingSketchService.uploadSketchPng(id, shotId, Buffer.concat(chunks));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/blocking-sketch/confirm", validate({ params: shotParamsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaShotBlockingSketchService.confirmSketch(id, shotId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/keyframe/prepare", validate({ params: shotParamsSchema, body: imageProviderBodySchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const body = req.body as { provider?: string; useCharacterRefImages?: boolean } | undefined;
    const data = await dramaShotKeyframeService.prepareKeyframe(
      shotId,
      body?.provider as Parameters<typeof dramaShotKeyframeService.prepareKeyframe>[1],
      body?.useCharacterRefImages ?? true,
    );
    res.status(200).json({ success: true, data, message: "Drama shot keyframe preview prepared." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/keyframe", validate({ params: shotParamsSchema, body: imageProviderBodySchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const body = req.body as {
      provider?: string;
      useCharacterRefImages?: boolean;
      promptOverride?: string;
      providerOverride?: string;
      sizeOverride?: string;
      negativePromptOverride?: string;
      excludedReferenceImageUrls?: string[];
    } | undefined;
    const data = await dramaShotKeyframeService.generateKeyframe(
      shotId,
      body?.provider as Parameters<typeof dramaShotKeyframeService.generateKeyframe>[1],
      body?.useCharacterRefImages ?? true,
      {
        promptOverride: body?.promptOverride,
        providerOverride: body?.providerOverride,
        sizeOverride: body?.sizeOverride as never,
        negativePromptOverride: body?.negativePromptOverride,
        excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
      },
    );
    res.status(200).json({ success: true, data, message: "Drama shot keyframe generated." });
  } catch (error) {
    next(error);
  }
});

router.post("/video-prompts/:videoPromptId/provider-task", validate({ params: videoPromptParamsSchema, body: providerTaskSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const body = (req.body ?? {}) as { provider?: string };
    const data = await dramaVideoPromptService.createProviderTask(videoPromptId, body.provider ?? resolveDefaultVideoProvider());
    res.status(200).json({ success: true, data, message: "Drama video task created." });
  } catch (error) {
    next(error);
  }
});

router.post("/video-prompts/:videoPromptId/provider-task/refresh", validate({ params: videoPromptParamsSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const data = await dramaVideoPromptService.refreshProviderTask(videoPromptId);
    res.status(200).json({ success: true, data, message: "Drama video task refreshed." });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 角色图片生成（形象图 + 四视图）
// ─────────────────────────────────────────────────────────────────────────────

const charImageParamsSchema = z.object({
  // characterId 进文件路径拼接，只放行 DB id 字符集，挡住路径穿越串。
  characterId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});
const charImageVersionParamsSchema = z.object({
  characterId: z.string().trim().min(1),
  version: z.string().trim().regex(/^v?\d+$/),
});

/** GET /api/drama/projects/:id/characters/:characterId/image-status */
router.get(
  "/projects/:id/characters/:characterId/image-status",
  validate({ params: characterParamsSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterImageService.getImageStatus(characterId);
      res.status(200).json({ success: true, data, message: "Character image status loaded." });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /api/drama/projects/:id/characters/:characterId/generate-character-sheet
 *  生成角色设计稿（面部特写 + 四视图合图，一次完成）。
 */
router.post(
  "/projects/:id/characters/:characterId/prepare-character-sheet",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const provider = (req.body as { provider?: string } | undefined)?.provider;
      const data = await dramaCharacterImageService.prepareCharacterSheet(
        characterId,
        provider as Parameters<typeof dramaCharacterImageService.prepareCharacterSheet>[1],
      );
      res.status(200).json({ success: true, data, message: "Character sheet preview prepared." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/generate-character-sheet",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as {
        provider?: string;
        promptOverride?: string;
        providerOverride?: string;
        sizeOverride?: string;
        negativePromptOverride?: string;
        excludedReferenceImageUrls?: string[];
      } | undefined;
      const data = await dramaCharacterImageService.generateCharacterSheet(
        characterId,
        body?.provider as Parameters<typeof dramaCharacterImageService.generateCharacterSheet>[1],
        {
          promptOverride: body?.promptOverride,
          providerOverride: body?.providerOverride,
          sizeOverride: body?.sizeOverride as never,
          negativePromptOverride: body?.negativePromptOverride,
          excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
        },
      );
      res.status(200).json({ success: true, data, message: "Character sheet generation completed." });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /api/drama/projects/:id/characters/:characterId/generate-portrait （兼容旧调用） */
router.post(
  "/projects/:id/characters/:characterId/generate-portrait",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const body = req.body as {
        provider?: string;
        promptOverride?: string;
        providerOverride?: string;
        sizeOverride?: string;
        negativePromptOverride?: string;
        excludedReferenceImageUrls?: string[];
      } | undefined;
      const data = await dramaCharacterImageService.generateCharacterSheet(
        characterId,
        body?.provider as Parameters<typeof dramaCharacterImageService.generateCharacterSheet>[1],
        {
          promptOverride: body?.promptOverride,
          providerOverride: body?.providerOverride,
          sizeOverride: body?.sizeOverride as never,
          negativePromptOverride: body?.negativePromptOverride,
          excludedReferenceImageUrls: body?.excludedReferenceImageUrls,
        },
      );
      res.status(200).json({ success: true, data, message: "Portrait generation completed." });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /api/drama/projects/:id/characters/:characterId/generate-three-view （兼容旧调用，转发到设计稿） */
router.post(
  "/projects/:id/characters/:characterId/generate-three-view",
  validate({ params: characterParamsSchema, body: imageProviderBodySchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const provider = (req.body as { provider?: string } | undefined)?.provider;
      const data = await dramaCharacterImageService.generateThreeView(
        characterId,
        provider as Parameters<typeof dramaCharacterImageService.generateThreeView>[1],
      );
      res.status(200).json({ success: true, data, message: "Three-view generation completed." });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 角色图片文件服务（本地存储直出）
// ─────────────────────────────────────────────────────────────────────────────

const threeViewParamsSchema = z.object({
  characterId: z.string().trim().min(1),
  view: z.enum(["front", "side", "back"]),
});

/** GET /api/drama/shot-images/:shotId/keyframe */
router.get("/shot-images/:shotId/keyframe", validate({ params: shotImageParamsSchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotImageParamsSchema>;
    const resolved = await dramaShotKeyframeService.resolveExistingKeyframePath(shotId);
    if (!resolved) {
      res.status(404).json({ success: false, message: "镜头分镜画面尚未生成。" });
      return;
    }
    if (await dramaShotKeyframeService.isExistingKeyframeReferencePassthrough(shotId, resolved)) {
      res.status(404).json({ success: false, message: "镜头 AI 首帧不可用，请重新生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/shot-images/:shotId/blocking-sketch */
router.get("/shot-images/:shotId/blocking-sketch", validate({ params: shotImageParamsSchema }), async (req, res, next) => {
  try {
    const { shotId } = req.params as z.infer<typeof shotImageParamsSchema>;
    const resolved = await dramaShotBlockingSketchService.resolveExistingBlockingSketchPath(shotId);
    if (!resolved) {
      res.status(404).json({ success: false, message: "镜头摆位草图尚未生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/shot-images/:shotId/keyframe/v1 */
router.get("/shot-images/:shotId/keyframe/:version", validate({ params: shotImageVersionParamsSchema }), async (req, res, next) => {
  try {
    const { shotId, version } = req.params as z.infer<typeof shotImageVersionParamsSchema>;
    const numericVersion = Number(version.replace(/^v/i, ""));
    const resolved = await dramaShotKeyframeService.resolveArchivedKeyframePath(shotId, numericVersion);
    if (!resolved) {
      res.status(404).json({ success: false, message: "镜头分镜画面历史版本尚未生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/character-images/:characterId/character-sheet */
router.get("/character-images/:characterId/character-sheet", validate({ params: charImageParamsSchema }), async (req, res, next) => {
  try {
    const { characterId } = req.params as z.infer<typeof charImageParamsSchema>;
    const resolved = await dramaCharacterImageService.resolveExistingImagePath(
      characterId,
      "character-sheet",
    );
    if (!resolved) {
      res.status(404).json({ success: false, message: "角色设计稿尚未生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/character-images/:characterId/character-sheet/v1 */
router.get("/character-images/:characterId/character-sheet/:version", validate({ params: charImageVersionParamsSchema }), async (req, res, next) => {
  try {
    const { characterId, version } = req.params as z.infer<typeof charImageVersionParamsSchema>;
    const numericVersion = Number(version.replace(/^v/i, ""));
    const resolved = await dramaCharacterImageService.resolveArchivedImagePath(
      characterId,
      "character-sheet",
      numericVersion,
    );
    if (!resolved) {
      res.status(404).json({ success: false, message: "角色设计稿历史版本尚未生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/character-images/:characterId/portrait （兼容旧 URL，指向同一文件） */
router.get("/character-images/:characterId/portrait", validate({ params: charImageParamsSchema }), async (req, res, next) => {
  try {
    const { characterId } = req.params as z.infer<typeof charImageParamsSchema>;
    const resolved = await dramaCharacterImageService.resolveExistingImagePath(
      characterId,
      "portrait",
    );
    if (!resolved) {
      res.status(404).json({ success: false, message: "角色设计稿尚未生成。" });
      return;
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(resolved.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

/** GET /api/drama/character-images/:characterId/three-view/:view */
router.get(
  "/character-images/:characterId/three-view/:view",
  validate({ params: threeViewParamsSchema }),
  async (req, res, next) => {
    try {
      const { characterId, view } = req.params as z.infer<typeof threeViewParamsSchema>;
      const resolved = await dramaCharacterImageService.resolveExistingImagePath(
        characterId,
        `three-view-${view}`,
      );
      if (!resolved) {
        res.status(404).json({ success: false, message: `${view} 四视图尚未生成。` });
        return;
      }
      res.setHeader("Content-Type", resolved.mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(resolved.filePath).pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
