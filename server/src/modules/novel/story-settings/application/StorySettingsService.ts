// 设定中心应用服务：角色/场景/道具/世界观的查看、编辑、AI 生成与短篇确认门槛。
// 边界说明：
// - 角色复用 Character 模型（只读列表 + 基础字段编辑），世界观摘要存 NovelSettingsWorld，
//   不写 NovelWorld 生成管线；已有导演世界观的小说由 AI 蒸馏成设定摘要（existingWorldText 输入）。
// - ensureSettings 幂等：只补缺失类别；regenerate 按类别重建。
// - 角色不做删除式重建（保护关系与状态数据），重新生成只会补充缺失角色。
import {
  isStoryAssetInitialStatePreserved,
  validateStoryAssetStateList,
  type StoryAssetState,
  type StoryAssetStateInput,
  type StoryCharacterLegacyFields,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  storyEntityGeneratePrompt,
  storySettingsBundlePrompt,
  type StoryEntityGenerateOutput,
  type StorySettingsBundleOutput,
} from "../../../../prompting/prompts/novel/storySettings.prompts";
import { WorldContextGateway } from "../../../../services/novel/worldContext/WorldContextGateway";
import { NovelWorkflowService } from "../../../../services/novel/workflow/NovelWorkflowService";
import { DRAMA_VISUAL_STYLE_PRESETS } from "../../../../services/drama/visual/dramaVisualStyles";
import { parseStoryAssetImage, type StoryAssetImageState } from "./StoryAssetImageService";
import {
  canSafelyRewriteStates,
  normalizeCharacterStates,
  normalizePropStates,
  normalizeSceneStates,
  parseStates,
  preserveStoryAssetRuntimeAssets,
  serializeStates,
} from "./StorySettingsStatePolicy";
import { projectCharacter, projectProp, projectScene, parseCharacterAliases, serializeCharacterAliases } from "./StorySettingsProjection";
import { persistStorySettingsCategories } from "./StorySettingsBundlePersistence";

export type StorySettingsCategory = "characters" | "scenes" | "props" | "world";

function assertValidStateInput(states: StoryAssetStateInput[] | undefined): void {
  if (states === undefined) {
    return;
  }
  const error = validateStoryAssetStateList(states);
  if (error) {
    throw new AppError(error, 400);
  }
}

export interface StoryEntityDraft {
  character: StoryEntityGenerateOutput["character"];
  scene: StoryEntityGenerateOutput["scene"];
  prop: StoryEntityGenerateOutput["prop"];
}

export interface StorySettingsOverview {
  novelId: string;
  counts: { characters: number; scenes: number; props: number };
  worldConfigured: boolean;
  settingsReady: boolean;
  awaitingConfirmation: boolean;
}

export interface StorySettingsScene {
  id: string;
  name: string;
  sceneType: string | null;
  summary: string | null;
  environmentPrompt: string | null;
  significance: string | null;
  /** 场景时间与天气（morning/noon/night；sunny/cloudy/rainy；null=未设定）——影响场景图光线 */
  timeOfDay: string | null;
  /** 场景天气（sunny/cloudy/rainy；null=未设定）——影响场景图氛围 */
  weather: string | null;
  /** 兼容旧版场景全景图的状态（产品场景图片以 states 为准）。 */
  image: StoryAssetImageState | null;
  mapNodeId: string | null;
  mapUnmappable: boolean;
  sortOrder: number;
  source: string;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface StorySettingsProp {
  id: string;
  name: string;
  propType: string;
  description: string | null;
  plotFunction: string | null;
  visualPrompt: string | null;
  ownerCharacterId: string | null;
  ownerCharacterName: string | null;
  importance: string;
  firstAppearHint: string | null;
  /** 45° 透视参考图（未生成过为 null）。 */
  image: StoryAssetImageState | null;
  sortOrder: number;
  source: string;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface StorySettingsCharacter {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  /** 别名/昵称（如 哥哥、晨哥）——解析与匹配按别名归一到本名。 */
  aliases: string[];
  ageGroup: string | null;
  physique: string | null;
  attireStyle: string | null;
  facePrompt: string | null;
  voiceTexture: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  states: StoryAssetState[];
  updatedAt: string;
}

export interface WorldMapViewData {
  overview: string;
  scaleKm: number | null;
  terrain: Array<{ id: string; type: string; label: string; points: Array<{ x: number; y: number }> }>;
  nodes: Array<{
    id: string;
    name: string;
    kind: string;
    summary: string;
    x: number | null;
    y: number | null;
    tier: string | null;
  }>;
  edges: Array<{ fromId: string; toId: string; label: string }>;
  childMaps: Record<string, WorldMapViewData>;
}

export interface StorySettingsArtStyle {
  label: string;
  prompt: string;
}

export interface StorySettingsWorldMapView {
  premise: string;
  era: string | null;
  toneRules: string[];
  keySettings: Array<{ title: string; content: string }>;
  /** 小说自定义美术风格（内置预设不落库，前端与预设列表合并展示）。 */
  artStyles: StorySettingsArtStyle[];
  /** 默认美术风格 id：内置预设 id 或自定义风格 key；null 表示用内置默认。 */
  defaultArtStyle: string | null;
  map: WorldMapViewData;
  source: string;
  updatedAt: string;
}

const CATEGORY_LIST: StorySettingsCategory[] = ["characters", "scenes", "props", "world"];

// 角色摘要行：有剧情定位时「名字（定位）」，没有就只写名字（定位不再由表单/提取维护）。
function formatCharacterSummary(name: string, role: string | null | undefined): string {
  const trimmed = role?.trim();
  return trimmed ? `${name}（${trimmed}）` : name;
}

// 场景时间与天气只收这三个枚举（2026-08-21 用户定的口径：早/中/晚，晴/阴/雨）。
const SCENE_TIME_OF_DAY_VALUES = new Set(["morning", "noon", "night"]);
const SCENE_WEATHER_VALUES = new Set(["sunny", "cloudy", "rainy"]);

function normalizeSceneTimeOfDay(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && SCENE_TIME_OF_DAY_VALUES.has(trimmed) ? trimmed : null;
}

function normalizeSceneWeather(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && SCENE_WEATHER_VALUES.has(trimmed) ? trimmed : null;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// 美术风格解析：只认 {label,prompt} 结构（历史上可能带 key，读取时剥离——风格身份就是名字，
// 与初稿【风格：…】标记一致）。同名去重、上限 12 条。
function parseArtStyles(value: string | null | undefined): StorySettingsArtStyle[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seenLabels = new Set<string>();
  const styles: StorySettingsArtStyle[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "").trim().slice(0, 20);
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    styles.push({ label, prompt: String((item as { prompt?: unknown }).prompt ?? "").trim().slice(0, 500) });
  }
  return styles.slice(0, 12);
}

function parseKeySettings(value: string | null | undefined): Array<{ title: string; content: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object"
        && typeof (item as { title?: unknown }).title === "string"
        && typeof (item as { content?: unknown }).content === "string")
      .map((item) => ({
        title: String((item as { title: string }).title),
        content: String((item as { content: string }).content),
      }));
  } catch {
    return [];
  }
}

// 地图解析：overview + 地形多边形 + 节点坐标（x/y 0-100，旧数据无坐标为 null）+ 连线 + 内部地图（递归）。
// 旧 mapJson（bundle 写入的 {nodes, edges}）天然兼容：新增字段缺省为空，无需迁移。
function parseMap(value: string | null | undefined, depth = 0): WorldMapViewData {
  const empty: WorldMapViewData = { overview: "", scaleKm: null, terrain: [], nodes: [], edges: [], childMaps: {} };
  if (!value) return empty;
  try {
    return parseMapObject(JSON.parse(value) as Record<string, unknown>, depth);
  } catch {
    return empty;
  }
}

function parseMapObject(parsed: Record<string, unknown>, depth: number): WorldMapViewData {
  const terrain = Array.isArray(parsed.terrain)
      ? parsed.terrain
        .filter((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
        .map((item) => {
          const record = item as { id: string; type?: unknown; label?: unknown; points?: unknown };
          return {
            id: record.id,
            type: typeof record.type === "string" ? record.type : "plain",
            label: typeof record.label === "string" ? record.label : "",
            points: Array.isArray(record.points)
              ? record.points
                .filter((point) => point && typeof point === "object")
                .map((point) => {
                  const pointRecord = point as { x?: unknown; y?: unknown };
                  return {
                    x: typeof pointRecord.x === "number" && Number.isFinite(pointRecord.x)
                      ? Math.min(100, Math.max(0, pointRecord.x)) : 0,
                    y: typeof pointRecord.y === "number" && Number.isFinite(pointRecord.y)
                      ? Math.min(100, Math.max(0, pointRecord.y)) : 0,
                  };
                })
              : [],
          };
        })
      : [];
    const nodes = Array.isArray(parsed.nodes)
      ? parsed.nodes
        .filter((node) => node && typeof node === "object" && typeof (node as { id?: unknown }).id === "string")
        .map((node) => {
          const record = node as {
            id: string;
            name?: unknown;
            kind?: unknown;
            summary?: unknown;
            x?: unknown;
            y?: unknown;
            tier?: unknown;
          };
          return {
            id: record.id,
            name: typeof record.name === "string" ? record.name : record.id,
            kind: typeof record.kind === "string" ? record.kind : "other",
            summary: typeof record.summary === "string" ? record.summary : "",
            x: typeof record.x === "number" && Number.isFinite(record.x) ? Math.min(100, Math.max(0, record.x)) : null,
            y: typeof record.y === "number" && Number.isFinite(record.y) ? Math.min(100, Math.max(0, record.y)) : null,
            tier: typeof record.tier === "string" ? record.tier : null,
          };
        })
      : [];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = Array.isArray(parsed.edges)
      ? parsed.edges
        .filter((edge) => edge && typeof edge === "object"
          && typeof (edge as { fromId?: unknown }).fromId === "string"
          && typeof (edge as { toId?: unknown }).toId === "string"
          && nodeIds.has((edge as { fromId: string }).fromId)
          && nodeIds.has((edge as { toId: string }).toId))
        .map((edge) => {
          const record = edge as { fromId: string; toId: string; label?: unknown };
          return {
            fromId: record.fromId,
            toId: record.toId,
            label: typeof record.label === "string" ? record.label : "",
          };
        })
      : [];
    const childMaps: Record<string, WorldMapViewData> = {};
    if (depth < 2 && parsed.childMaps && typeof parsed.childMaps === "object") {
      for (const [key, child] of Object.entries(parsed.childMaps as Record<string, unknown>)) {
        if (!child || typeof child !== "object" || !nodeIds.has(key)) continue;
        childMaps[key] = parseMapObject(child as Record<string, unknown>, depth + 1);
      }
    }
    return {
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      scaleKm: typeof parsed.scaleKm === "number" && Number.isFinite(parsed.scaleKm) && parsed.scaleKm > 0
        ? parsed.scaleKm : null,
      terrain,
      nodes,
      edges,
      childMaps,
    };
}

function normalizeCategories(value: unknown): StorySettingsCategory[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...CATEGORY_LIST];
  }
  return value.filter((item): item is StorySettingsCategory =>
    typeof item === "string" && (CATEGORY_LIST as string[]).includes(item));
}

async function requireNovel(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { genre: true },
  });
  if (!novel) {
    throw new AppError("没有找到这本小说。", 404);
  }
  return novel;
}

async function loadActiveIntent(novelId: string): Promise<{
  originalIdea: string;
  understanding: string;
} | null> {
  const intentRow = await prisma.novelIntentVersion.findFirst({
    where: { novelId, status: "active" },
    orderBy: { version: "desc" },
  });
  if (!intentRow) {
    return null;
  }
  let understanding = "";
  try {
    const parsed = JSON.parse(intentRow.structuredIntentJson) as { understanding?: unknown };
    understanding = typeof parsed.understanding === "string" ? parsed.understanding : "";
  } catch {
    understanding = "";
  }
  return {
    originalIdea: intentRow.originalExpression,
    understanding,
  };
}

const CHARACTER_GENDER_VALUES = ["male", "female", "other", "unknown"] as const;
const CHARACTER_AGE_GROUP_VALUES = ["child", "youth", "middle", "elder"] as const;

function normalizeCharacterGender(value: string | null | undefined): "male" | "female" | "other" | "unknown" {
  const normalized = value?.trim().toLowerCase();
  return (CHARACTER_GENDER_VALUES as readonly string[]).includes(normalized ?? "")
    ? normalized as "male" | "female" | "other" | "unknown"
    : "unknown";
}

function normalizeCharacterAgeGroup(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized && (CHARACTER_AGE_GROUP_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return null;
}

export class StorySettingsService {
  private readonly worldContextGateway = new WorldContextGateway();
  private readonly workflowService = new NovelWorkflowService();

  // ---- 实体级 AI 生成 ----

  // 按用户提示生成单个实体草稿（不落库），返回给前端预览编辑后保存。
  async generateEntityDraft(
    novelId: string,
    entityType: "character" | "scene" | "prop",
    hint?: string,
  ): Promise<StoryEntityDraft> {
    const novel = await requireNovel(novelId);
    const [worldRow, characters, scenes, props] = await Promise.all([
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
      prisma.novelScene.findMany({
        where: { novelId },
        select: { name: true },
        orderBy: [{ sortOrder: "asc" }],
        take: 20,
      }),
      prisma.novelProp.findMany({
        where: { novelId },
        select: { name: true },
        orderBy: [{ sortOrder: "asc" }],
        take: 20,
      }),
    ]);
    const generated = await runStructuredPrompt({
      asset: storyEntityGeneratePrompt,
      promptInput: {
        novelTitle: novel.title,
        genreName: novel.genre?.name ?? undefined,
        entityType,
        hint: hint?.trim() || undefined,
        worldPremise: worldRow?.premise?.trim() || undefined,
        existingCharacters: characters.map((character) => formatCharacterSummary(character.name, character.role)),
        existingScenes: scenes.map((scene) => scene.name),
        existingProps: props.map((prop) => prop.name),
      },
      options: {
        novelId,
        stage: "short_story_settings",
        entrypoint: "story_settings",
        temperature: 0.9,
      },
    });
    return {
      character: generated.output.character ?? null,
      scene: generated.output.scene ?? null,
      prop: generated.output.prop ?? null,
    };
  }

  // ---- 写作上下文快照 ----

  // 供正文生成组装使用的紧凑设定快照；没有任何设定数据时返回 null（不产生上下文块）。
  async getPromptSnapshot(novelId: string): Promise<{
    characters: Array<{ name: string; role: string; personality: string | null }>;
    scenes: Array<{ name: string; summary: string | null; significance: string | null }>;
    props: Array<{ name: string; description: string | null; plotFunction: string | null; importance: string }>;
    world: {
      premise: string;
      era: string | null;
      toneRules: string[];
      keySettings: Array<{ title: string; content: string }>;
      locationNames: string[];
    } | null;
  } | null> {
    const [characters, scenes, props, worldRow] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true, personality: true },
        orderBy: { createdAt: "asc" },
        take: 12,
      }),
      prisma.novelScene.findMany({
        where: { novelId },
        select: { name: true, summary: true, significance: true },
        orderBy: [{ sortOrder: "asc" }],
        take: 10,
      }),
      prisma.novelProp.findMany({
        where: { novelId },
        select: { name: true, description: true, plotFunction: true, importance: true },
        orderBy: [{ sortOrder: "asc" }],
        take: 10,
      }),
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
    ]);
    const hasWorld = Boolean(worldRow && (worldRow.premise.trim() || parseMap(worldRow.mapJson).nodes.length > 0));
    if (characters.length === 0 && scenes.length === 0 && props.length === 0 && !hasWorld) {
      return null;
    }
    return {
      characters,
      scenes,
      props,
      world: hasWorld && worldRow ? {
        premise: worldRow.premise,
        era: worldRow.era,
        toneRules: parseJsonArray(worldRow.toneRulesJson),
        keySettings: parseKeySettings(worldRow.keySettingsJson),
        locationNames: parseMap(worldRow.mapJson).nodes.map((node) => node.name),
      } : null,
    };
  }

  // ---- 概览与门槛状态 ----

  async getOverview(novelId: string): Promise<StorySettingsOverview> {
    await requireNovel(novelId);
    const [characterCount, sceneCount, propCount, worldRow, gateTask] = await Promise.all([
      prisma.character.count({ where: { novelId } }),
      prisma.novelScene.count({ where: { novelId } }),
      prisma.novelProp.count({ where: { novelId } }),
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
      prisma.novelWorkflowTask.findFirst({
        where: { novelId, lane: "creation_studio", checkpointType: "settings_ready" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, status: true },
      }),
    ]);
    const worldConfigured = Boolean(worldRow?.premise?.trim()) || parseMap(worldRow?.mapJson).nodes.length > 0;
    const settingsReady = characterCount > 0 && sceneCount > 0 && propCount > 0 && worldConfigured;
    return {
      novelId,
      counts: { characters: characterCount, scenes: sceneCount, props: propCount },
      worldConfigured,
      settingsReady,
      awaitingConfirmation: gateTask?.status === "waiting_approval",
    };
  }

  // 短篇生产门槛：缺失类别时生成并要求确认；齐全时放行。
  async prepareShortStorySettingsGate(novelId: string): Promise<{ awaitingConfirmation: boolean }> {
    const overview = await this.getOverview(novelId);
    if (overview.settingsReady) {
      return { awaitingConfirmation: false };
    }
    await this.ensureSettings(novelId);
    return { awaitingConfirmation: true };
  }

  // ---- 场景 ----

  async listScenes(novelId: string): Promise<StorySettingsScene[]> {
    await requireNovel(novelId);
    const rows = await prisma.novelScene.findMany({
      where: { novelId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return Promise.all(rows.map(async (row) => {
      const states = normalizeSceneStates(parseStates(row.statesJson), row);
      if (canSafelyRewriteStates(row.statesJson)) {
        const normalizedStatesJson = serializeStates(states);
        if (normalizedStatesJson !== (row.statesJson?.trim() || null)) {
          await prisma.novelScene.updateMany({
            where: { id: row.id, statesJson: row.statesJson },
            data: { statesJson: normalizedStatesJson },
          });
        }
      }
      return {
        id: row.id,
        name: row.name,
        sceneType: row.sceneType,
        summary: row.summary,
        environmentPrompt: row.environmentPrompt,
        significance: row.significance,
        timeOfDay: normalizeSceneTimeOfDay(row.timeOfDay),
        weather: normalizeSceneWeather(row.weather),
        image: parseStoryAssetImage(row.imageData),
        mapNodeId: row.mapNodeId,
        mapUnmappable: row.mapUnmappable,
        sortOrder: row.sortOrder,
        source: row.source,
        states,
        updatedAt: row.updatedAt.toISOString(),
      };
    }));
  }

  async createScene(novelId: string, input: {
    name: string;
    sceneType?: string | null;
    summary?: string | null;
    environmentPrompt?: string | null;
    significance?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mapNodeId?: string | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsScene> {
    await requireNovel(novelId);
    assertValidStateInput(input.states);
    const maxOrder = await prisma.novelScene.findFirst({
      where: { novelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const states = normalizeSceneStates(input.states, input);
    const row = await prisma.novelScene.create({
      data: {
        novelId,
        name: input.name,
        sceneType: input.sceneType ?? null,
        summary: input.summary ?? null,
        environmentPrompt: input.environmentPrompt ?? null,
        significance: input.significance ?? null,
        timeOfDay: normalizeSceneTimeOfDay(input.timeOfDay),
        weather: normalizeSceneWeather(input.weather),
        mapNodeId: input.mapNodeId ?? null,
        statesJson: serializeStates(states),
        sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
        source: "manual",
      },
    });
    return projectScene(row);
  }

  async updateScene(novelId: string, sceneId: string, input: {
    name?: string;
    sceneType?: string | null;
    summary?: string | null;
    environmentPrompt?: string | null;
    significance?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mapNodeId?: string | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsScene> {
    assertValidStateInput(input.states);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await prisma.novelScene.findFirst({ where: { id: sceneId, novelId } });
      if (!row) {
        throw new AppError("没有找到这个场景。", 404);
      }
      const parsedStates = parseStates(row.statesJson);
      const previousStates = normalizeSceneStates(parsedStates, row);
      const nextStates = input.states !== undefined
        ? normalizeSceneStates(input.states, { ...row, ...input })
        : normalizeSceneStates(parsedStates, { ...row, ...input });
      const states = input.states !== undefined
        ? preserveStoryAssetRuntimeAssets(previousStates, nextStates)
        : nextStates;
      if (input.states !== undefined && !isStoryAssetInitialStatePreserved(previousStates, states)) {
        throw new AppError("初始状态不能删除或移动。", 400);
      }
      const statesJson = input.states !== undefined || canSafelyRewriteStates(row.statesJson)
        ? serializeStates(states)
        : undefined;
      const result = await prisma.novelScene.updateMany({
        where: { id: row.id, novelId, statesJson: row.statesJson },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sceneType !== undefined ? { sceneType: input.sceneType } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.environmentPrompt !== undefined ? { environmentPrompt: input.environmentPrompt } : {}),
          ...(input.significance !== undefined ? { significance: input.significance } : {}),
          ...(input.timeOfDay !== undefined ? { timeOfDay: normalizeSceneTimeOfDay(input.timeOfDay) } : {}),
          ...(input.weather !== undefined ? { weather: normalizeSceneWeather(input.weather) } : {}),
          ...(input.mapNodeId !== undefined ? { mapNodeId: input.mapNodeId } : {}),
          ...(statesJson !== undefined ? { statesJson } : {}),
        },
      });
      if (result.count !== 1) {
        continue;
      }
      const updated = await prisma.novelScene.findUnique({ where: { id: row.id } });
      if (!updated) {
        throw new AppError("场景更新后无法读取。", 500);
      }
      return projectScene(updated);
    }
    throw new AppError("设定已被其他操作更新，请刷新后重试。", 409);
  }

  async deleteScene(novelId: string, sceneId: string): Promise<void> {
    const row = await prisma.novelScene.findFirst({ where: { id: sceneId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个场景。", 404);
    }
    await prisma.novelScene.delete({ where: { id: row.id } });
  }

  // ---- 道具 ----

  async listProps(novelId: string): Promise<StorySettingsProp[]> {
    await requireNovel(novelId);
    const [rows, characters] = await Promise.all([
      prisma.novelProp.findMany({
        where: { novelId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true },
      }),
    ]);
    const characterNames = new Map(characters.map((character) => [character.id, character.name]));
    return Promise.all(rows.map(async (row) => {
      const states = normalizePropStates(parseStates(row.statesJson), row);
      if (canSafelyRewriteStates(row.statesJson)) {
        const normalizedStatesJson = serializeStates(states);
        if (normalizedStatesJson !== (row.statesJson?.trim() || null)) {
          await prisma.novelProp.updateMany({
            where: { id: row.id, statesJson: row.statesJson },
            data: { statesJson: normalizedStatesJson },
          });
        }
      }
      return {
        id: row.id,
        name: row.name,
        propType: row.propType,
        description: row.description,
        plotFunction: row.plotFunction,
        visualPrompt: row.visualPrompt,
        ownerCharacterId: row.ownerCharacterId,
        ownerCharacterName: row.ownerCharacterId
          ? characterNames.get(row.ownerCharacterId) ?? null
          : null,
        importance: row.importance,
        firstAppearHint: row.firstAppearHint,
        image: parseStoryAssetImage(row.imageData),
        sortOrder: row.sortOrder,
        source: row.source,
        states,
        updatedAt: row.updatedAt.toISOString(),
      };
    }));
  }

  async createProp(novelId: string, input: {
    name: string;
    propType?: string | null;
    description?: string | null;
    plotFunction?: string | null;
    visualPrompt?: string | null;
    ownerCharacterId?: string | null;
    importance?: string;
    firstAppearHint?: string | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsProp> {
    await requireNovel(novelId);
    assertValidStateInput(input.states);
    const maxOrder = await prisma.novelProp.findFirst({
      where: { novelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const states = normalizePropStates(input.states, input);
    const row = await prisma.novelProp.create({
      data: {
        novelId,
        name: input.name,
        propType: input.propType ?? "object",
        description: input.description ?? null,
        plotFunction: input.plotFunction ?? null,
        visualPrompt: input.visualPrompt ?? null,
        ownerCharacterId: input.ownerCharacterId ?? null,
        importance: input.importance ?? "major",
        firstAppearHint: input.firstAppearHint ?? null,
        statesJson: serializeStates(states),
        sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
        source: "manual",
      },
    });
    const ownerName = row.ownerCharacterId
      ? (await prisma.character.findUnique({
        where: { id: row.ownerCharacterId },
        select: { name: true },
      }))?.name ?? null
      : null;
    return projectProp(row, ownerName);
  }

  async updateProp(novelId: string, propId: string, input: {
    name?: string;
    propType?: string | null;
    description?: string | null;
    plotFunction?: string | null;
    visualPrompt?: string | null;
    ownerCharacterId?: string | null;
    importance?: string;
    firstAppearHint?: string | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsProp> {
    assertValidStateInput(input.states);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await prisma.novelProp.findFirst({ where: { id: propId, novelId } });
      if (!row) {
        throw new AppError("没有找到这个道具。", 404);
      }
      const parsedStates = parseStates(row.statesJson);
      const previousStates = normalizePropStates(parsedStates, row);
      const nextStates = input.states !== undefined
        ? normalizePropStates(input.states, { ...row, ...input })
        : normalizePropStates(parsedStates, { ...row, ...input });
      const states = input.states !== undefined
        ? preserveStoryAssetRuntimeAssets(previousStates, nextStates)
        : nextStates;
      if (input.states !== undefined && !isStoryAssetInitialStatePreserved(previousStates, states)) {
        throw new AppError("初始状态不能删除或移动。", 400);
      }
      const statesJson = input.states !== undefined || canSafelyRewriteStates(row.statesJson)
        ? serializeStates(states)
        : undefined;
      const result = await prisma.novelProp.updateMany({
        where: { id: row.id, novelId, statesJson: row.statesJson },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.propType !== undefined ? { propType: input.propType ?? "object" } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.plotFunction !== undefined ? { plotFunction: input.plotFunction } : {}),
          ...(input.visualPrompt !== undefined ? { visualPrompt: input.visualPrompt } : {}),
          ...(input.ownerCharacterId !== undefined ? { ownerCharacterId: input.ownerCharacterId } : {}),
          ...(input.importance !== undefined ? { importance: input.importance } : {}),
          ...(input.firstAppearHint !== undefined ? { firstAppearHint: input.firstAppearHint } : {}),
          ...(statesJson !== undefined ? { statesJson } : {}),
        },
      });
      if (result.count !== 1) {
        continue;
      }
      const updated = await prisma.novelProp.findUnique({ where: { id: row.id } });
      if (!updated) {
        throw new AppError("道具更新后无法读取。", 500);
      }
      const ownerName = updated.ownerCharacterId
        ? (await prisma.character.findUnique({
          where: { id: updated.ownerCharacterId },
          select: { name: true },
        }))?.name ?? null
        : null;
      return projectProp(updated, ownerName);
    }
    throw new AppError("设定已被其他操作更新，请刷新后重试。", 409);
  }

  async deleteProp(novelId: string, propId: string): Promise<void> {
    const row = await prisma.novelProp.findFirst({ where: { id: propId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个道具。", 404);
    }
    await prisma.novelProp.delete({ where: { id: row.id } });
  }

  // ---- 角色（复用 Character，仅基础字段） ----

  async listCharacters(novelId: string): Promise<StorySettingsCharacter[]> {
    await requireNovel(novelId);
    const rows = await prisma.character.findMany({
      where: { novelId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        gender: true,
        ageGroup: true,
        physique: true,
        attireStyle: true,
        facePrompt: true,
        voiceTexture: true,
        personality: true,
        appearance: true,
        background: true,
        statesJson: true,
        aliasesJson: true,
        updatedAt: true,
      },
    });
    return Promise.all(rows.map(async (row) => {
      const { statesJson, aliasesJson, ...rest } = row;
      const parsedStates = parseStates(statesJson);
      const states = normalizeCharacterStates(parsedStates, row);
      const normalizedStatesJson = serializeStates(states);
      // 只做增量归并：旧角色第一次进入设定中心时补上初始状态，保留旧字段作为兼容回退。
      if (canSafelyRewriteStates(statesJson) && normalizedStatesJson !== (statesJson?.trim() || null)) {
        await prisma.character.updateMany({
          where: { id: row.id, statesJson },
          data: { statesJson: normalizedStatesJson },
        });
      }
      return {
        ...rest,
        aliases: parseCharacterAliases(aliasesJson, row.name),
        states,
        updatedAt: row.updatedAt.toISOString(),
      };
    }));
  }

  async createCharacter(novelId: string, input: {
    name: string;
    /** 剧情定位已不在表单/提取里维护（2026-08-21）；DB 列保留，AI 生成设定包仍会填。 */
    role?: string;
    gender?: string | null;
    ageGroup?: string | null;
    physique?: string | null;
    attireStyle?: string | null;
    facePrompt?: string | null;
    voiceTexture?: string | null;
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
    /** 别名/昵称列表；传 null/空数组清空。 */
    aliases?: string[] | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsCharacter> {
    await requireNovel(novelId);
    assertValidStateInput(input.states);
    const legacy: StoryCharacterLegacyFields = {
      name: input.name,
      gender: input.gender,
      ageGroup: input.ageGroup,
      physique: input.physique,
      attireStyle: input.attireStyle,
      facePrompt: input.facePrompt,
      appearance: input.appearance,
      voiceTexture: input.voiceTexture,
    };
    const states = normalizeCharacterStates(input.states, legacy);
    const row = await prisma.character.create({
      data: {
        novelId,
        name: input.name,
        role: input.role ?? "",
        gender: normalizeCharacterGender(input.gender),
        ageGroup: normalizeCharacterAgeGroup(input.ageGroup),
        physique: input.physique ?? null,
        attireStyle: input.attireStyle ?? null,
        facePrompt: input.facePrompt ?? null,
        voiceTexture: input.voiceTexture ?? null,
        personality: input.personality ?? null,
        appearance: input.appearance ?? null,
        background: input.background ?? null,
        aliasesJson: serializeCharacterAliases(input.aliases, input.name),
        statesJson: serializeStates(states),
      },
    });
    return projectCharacter(row);
  }

  async updateCharacter(novelId: string, characterId: string, input: {
    name?: string;
    role?: string;
    gender?: string | null;
    ageGroup?: string | null;
    physique?: string | null;
    attireStyle?: string | null;
    facePrompt?: string | null;
    voiceTexture?: string | null;
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
    /** 别名/昵称列表；传 null/空数组清空。 */
    aliases?: string[] | null;
    states?: StoryAssetStateInput[];
  }): Promise<StorySettingsCharacter> {
    assertValidStateInput(input.states);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await prisma.character.findFirst({ where: { id: characterId, novelId } });
      if (!row) {
        throw new AppError("没有找到这个角色。", 404);
      }
      const nextLegacy: StoryCharacterLegacyFields = {
        name: input.name !== undefined ? input.name : row.name,
        gender: input.gender !== undefined ? input.gender : row.gender,
        ageGroup: input.ageGroup !== undefined ? input.ageGroup : row.ageGroup,
        physique: input.physique !== undefined ? input.physique : row.physique,
        attireStyle: input.attireStyle !== undefined ? input.attireStyle : row.attireStyle,
        facePrompt: input.facePrompt !== undefined ? input.facePrompt : row.facePrompt,
        appearance: input.appearance !== undefined ? input.appearance : row.appearance,
        voiceTexture: input.voiceTexture !== undefined ? input.voiceTexture : row.voiceTexture,
      };
      const persistedStates = parseStates(row.statesJson);
      const currentStates = normalizeCharacterStates(persistedStates, nextLegacy);
      const nextStates = normalizeCharacterStates(
        input.states !== undefined ? input.states : persistedStates,
        nextLegacy,
      );
      const states = input.states !== undefined
        ? preserveStoryAssetRuntimeAssets(currentStates, nextStates)
        : nextStates;
      if (input.states !== undefined && !isStoryAssetInitialStatePreserved(currentStates, states)) {
        throw new AppError("初始状态不能删除或移动。", 400);
      }
      const statesJson = input.states !== undefined || canSafelyRewriteStates(row.statesJson)
        ? serializeStates(states)
        : undefined;
      const result = await prisma.character.updateMany({
        where: { id: row.id, novelId, statesJson: row.statesJson },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.gender !== undefined ? { gender: normalizeCharacterGender(input.gender) } : {}),
          ...(input.ageGroup !== undefined ? { ageGroup: normalizeCharacterAgeGroup(input.ageGroup) } : {}),
          ...(input.physique !== undefined ? { physique: input.physique } : {}),
          ...(input.attireStyle !== undefined ? { attireStyle: input.attireStyle } : {}),
          ...(input.facePrompt !== undefined ? { facePrompt: input.facePrompt } : {}),
          ...(input.voiceTexture !== undefined ? { voiceTexture: input.voiceTexture } : {}),
          ...(statesJson !== undefined ? { statesJson } : {}),
          ...(input.aliases !== undefined
            ? { aliasesJson: serializeCharacterAliases(input.aliases, input.name !== undefined ? input.name : row.name) }
            : {}),
          ...(input.personality !== undefined ? { personality: input.personality } : {}),
          ...(input.appearance !== undefined ? { appearance: input.appearance } : {}),
          ...(input.background !== undefined ? { background: input.background } : {}),
        },
      });
      if (result.count !== 1) {
        continue;
      }
      const updated = await prisma.character.findFirst({ where: { id: row.id, novelId } });
      if (!updated) {
        throw new AppError("角色更新后无法读取。", 500);
      }
      return projectCharacter(updated);
    }
    throw new AppError("设定已被其他操作更新，请刷新后重试。", 409);
  }

  async deleteCharacter(novelId: string, characterId: string): Promise<void> {
    const row = await prisma.character.findFirst({ where: { id: characterId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个角色。", 404);
    }
    try {
      await prisma.character.delete({ where: { id: row.id } });
    } catch (error) {
      // Character 被小说写作链路（状态账本/关系/时间线等）引用时数据库会拒绝删除；
      // 设定资产场景下通常无引用可直接删，有引用时给出明确提示而不是 500。
      const code = (error as { code?: string }).code;
      if (code === "P2003") {
        throw new AppError("这个角色已被写作数据（状态/关系/时间线等）引用，不能在这里删除。", 409);
      }
      throw error;
    }
  }

  // ---- 世界观 ----

  async getWorld(novelId: string): Promise<StorySettingsWorldMapView> {
    await requireNovel(novelId);
    const row = await prisma.novelSettingsWorld.findUnique({ where: { novelId } });
    if (!row) {
      return {
        premise: "",
        era: null,
        toneRules: [],
        keySettings: [],
        artStyles: [],
        defaultArtStyle: null,
        map: { overview: "", scaleKm: null, terrain: [], nodes: [], edges: [], childMaps: {} },
        source: "ai",
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      premise: row.premise,
      era: row.era,
      toneRules: parseJsonArray(row.toneRulesJson),
      keySettings: parseKeySettings(row.keySettingsJson),
      artStyles: parseArtStyles(row.artStylesJson),
      defaultArtStyle: row.defaultArtStyle?.trim() || null,
      map: parseMap(row.mapJson),
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateWorld(novelId: string, input: {
    premise?: string;
    era?: string | null;
    toneRules?: string[];
    keySettings?: Array<{ title: string; content: string }>;
    artStyles?: Array<{ label: string; prompt?: string }>;
    defaultArtStyle?: string | null;
  }): Promise<StorySettingsWorldMapView> {
    await requireNovel(novelId);
    let effective = input;
    // 默认风格必须能落到具体风格（内置预设或自定义名）；删除默认自定义风格而未指新默认时，
    // 回落为内置默认，避免残留无法解析的引用。
    if (input.defaultArtStyle !== undefined || input.artStyles !== undefined) {
      const current = await prisma.novelSettingsWorld.findUnique({
        where: { novelId },
        select: { defaultArtStyle: true, artStylesJson: true },
      });
      const nextStyles = input.artStyles ?? parseArtStyles(current?.artStylesJson);
      const customLabels = new Set(nextStyles.map((style) => style.label));
      const presetIds = new Set(DRAMA_VISUAL_STYLE_PRESETS.map((preset) => preset.id));
      const requested = input.defaultArtStyle !== undefined ? input.defaultArtStyle : current?.defaultArtStyle ?? null;
      if (requested && !customLabels.has(requested) && !presetIds.has(requested)) {
        if (input.defaultArtStyle) {
          throw new AppError("默认美术风格不存在，请从风格列表里选择。", 400);
        }
        effective = { ...input, defaultArtStyle: null };
      }
    }
    const data = {
      ...(effective.premise !== undefined ? { premise: effective.premise } : {}),
      ...(effective.era !== undefined ? { era: effective.era } : {}),
      ...(effective.toneRules !== undefined ? { toneRulesJson: JSON.stringify(effective.toneRules) } : {}),
      ...(effective.keySettings !== undefined ? { keySettingsJson: JSON.stringify(effective.keySettings) } : {}),
      ...(effective.artStyles !== undefined ? { artStylesJson: JSON.stringify(effective.artStyles) } : {}),
      ...(effective.defaultArtStyle !== undefined ? { defaultArtStyle: effective.defaultArtStyle } : {}),
    };
    if (Object.keys(data).length === 0) {
      return this.getWorld(novelId);
    }
    await prisma.novelSettingsWorld.upsert({
      where: { novelId },
      create: {
        novelId,
        premise: effective.premise ?? "",
        era: effective.era ?? null,
        toneRulesJson: JSON.stringify(effective.toneRules ?? []),
        keySettingsJson: JSON.stringify(effective.keySettings ?? []),
        artStylesJson: JSON.stringify(effective.artStyles ?? []),
        defaultArtStyle: effective.defaultArtStyle ?? null,
        source: "manual",
      },
      update: { ...data, source: "manual" },
    });
    return this.getWorld(novelId);
  }

  // ---- AI 生成 ----

  // 幂等补全：只处理缺失的类别；没有任何缺失时不发起模型调用。
  async ensureSettings(novelId: string, options: { categories?: unknown } = {}): Promise<{
    generated: StorySettingsCategory[];
  }> {
    const requested = normalizeCategories(options.categories);
    const novel = await requireNovel(novelId);
    const [characterCount, sceneCount, propCount, worldRow] = await Promise.all([
      prisma.character.count({ where: { novelId } }),
      prisma.novelScene.count({ where: { novelId } }),
      prisma.novelProp.count({ where: { novelId } }),
      prisma.novelSettingsWorld.findUnique({ where: { novelId } }),
    ]);
    const missing: StorySettingsCategory[] = [];
    if (requested.includes("characters") && characterCount === 0) missing.push("characters");
    if (requested.includes("scenes") && sceneCount === 0) missing.push("scenes");
    if (requested.includes("props") && propCount === 0) missing.push("props");
    if (requested.includes("world") && !worldRow) missing.push("world");
    if (missing.length === 0) {
      return { generated: [] };
    }

    const bundle = await this.generateBundle(novel, novelId);
    await persistStorySettingsCategories(novelId, bundle, missing, { replace: false });
    return { generated: missing };
  }

  // 按类别重建：场景/道具/世界观整体替换；角色只补充缺失（不删除已有角色，保护关系数据）。
  async regenerate(novelId: string, category: StorySettingsCategory): Promise<void> {
    const novel = await requireNovel(novelId);
    const bundle = await this.generateBundle(novel, novelId);
    await persistStorySettingsCategories(novelId, bundle, [category], { replace: true });
  }

  // 短篇确认：清除 settings_ready 检查点并重新排队；生产任务的调度由路由层触发（避免模块循环依赖）。
  async confirmShortStorySettings(novelId: string): Promise<{ taskId: string | null }> {
    const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { narrativeForm: true } });
    if (!novel) {
      throw new AppError("没有找到这本小说。", 404);
    }
    if (novel.narrativeForm !== "short_story") {
      throw new AppError("只有短篇作品需要确认设定后开始写作。", 400);
    }
    const task = await prisma.novelWorkflowTask.findFirst({
      where: { novelId, lane: "creation_studio", checkpointType: "settings_ready" },
      orderBy: { updatedAt: "desc" },
    });
    if (!task) {
      return { taskId: null };
    }
    if (task.status !== "waiting_approval") {
      return { taskId: task.id };
    }
    await this.workflowService.clearCheckpointAndRequeue(task.id, {
      summary: "设定已确认，开始写作。",
    });
    return { taskId: task.id };
  }

  // ---- 内部：生成与落库 ----

  private async generateBundle(
    novel: Awaited<ReturnType<typeof requireNovel>>,
    novelId: string,
  ): Promise<StorySettingsBundleOutput> {
    const intent = await loadActiveIntent(novelId);
    if (!intent) {
      throw new AppError("这本书还没有生效中的创作想法，无法生成设定。", 400);
    }
    const [worldBlock, existingCharacters] = await Promise.all([
      this.worldContextGateway.getWorldContextBlock(novelId, { purpose: "character" }).catch(() => null),
      prisma.character.findMany({
        where: { novelId },
        select: { name: true, role: true },
        take: 12,
      }),
    ]);
    const existingWorldText = worldBlock
      ? [worldBlock.summaryText, worldBlock.worldRulesText, worldBlock.worldStageText]
        .filter((text) => text && text.trim())
        .join("\n") || null
      : null;
    const generated = await runStructuredPrompt({
      asset: storySettingsBundlePrompt,
      promptInput: {
        novelTitle: novel.title,
        originalIdea: intent.originalIdea,
        understanding: intent.understanding || undefined,
        genreName: novel.genre?.name ?? undefined,
        narrativeForm: novel.narrativeForm === "short_story" ? "short_story" : "long_novel",
        existingWorldText: existingWorldText ?? undefined,
        existingCharacterSummaries: existingCharacters.length > 0
          ? existingCharacters.map((character) => formatCharacterSummary(character.name, character.role))
          : undefined,
      },
      options: {
        novelId,
        stage: "short_story_settings",
        entrypoint: "story_settings",
        temperature: 0.6,
      },
    });
    return generated.output;
  }

}

export const storySettingsService = new StorySettingsService();
