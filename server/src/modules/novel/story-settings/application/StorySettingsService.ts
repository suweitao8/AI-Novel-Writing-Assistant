// 设定中心应用服务：角色/场景/道具/世界观的查看、编辑、AI 生成与短篇确认门槛。
// 边界说明：
// - 角色复用 Character 模型（只读列表 + 基础字段编辑），世界观摘要存 NovelSettingsWorld，
//   不写 NovelWorld 生成管线；已有导演世界观的小说由 AI 蒸馏成设定摘要（existingWorldText 输入）。
// - ensureSettings 幂等：只补缺失类别；regenerate 按类别重建。
// - 角色不做删除式重建（保护关系与状态数据），重新生成只会补充缺失角色。
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

export type StorySettingsCategory = "characters" | "scenes" | "props" | "world";

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
  mapNodeId: string | null;
  sortOrder: number;
  source: string;
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
  sortOrder: number;
  source: string;
  updatedAt: string;
}

export interface StorySettingsCharacter {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  ageGroup: string | null;
  physique: string | null;
  attireStyle: string | null;
  facePrompt: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  updatedAt: string;
}

export interface StorySettingsWorldMapView {
  premise: string;
  era: string | null;
  toneRules: string[];
  keySettings: Array<{ title: string; content: string }>;
  map: {
    overview: string;
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
  };
  source: string;
  updatedAt: string;
}

const CATEGORY_LIST: StorySettingsCategory[] = ["characters", "scenes", "props", "world"];

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
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

// 地图解析：overview + 节点坐标（x/y 0-100，旧数据无坐标为 null）+ 连线。
// 旧 mapJson（bundle 写入的 {nodes, edges}）天然兼容：overview 缺省空串、坐标缺省 null。
function parseMap(value: string | null | undefined): StorySettingsWorldMapView["map"] {
  const empty: StorySettingsWorldMapView["map"] = { overview: "", nodes: [], edges: [] };
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as {
      overview?: unknown;
      nodes?: unknown;
      edges?: unknown;
    };
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
    return {
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      nodes,
      edges,
    };
  } catch {
    return empty;
  }
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
        existingCharacters: characters.map((character) => `${character.name}（${character.role}）`),
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
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sceneType: row.sceneType,
      summary: row.summary,
      environmentPrompt: row.environmentPrompt,
      significance: row.significance,
      mapNodeId: row.mapNodeId,
      sortOrder: row.sortOrder,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createScene(novelId: string, input: {
    name: string;
    sceneType?: string | null;
    summary?: string | null;
    environmentPrompt?: string | null;
    significance?: string | null;
    mapNodeId?: string | null;
  }): Promise<StorySettingsScene> {
    await requireNovel(novelId);
    const maxOrder = await prisma.novelScene.findFirst({
      where: { novelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await prisma.novelScene.create({
      data: {
        novelId,
        name: input.name,
        sceneType: input.sceneType ?? null,
        summary: input.summary ?? null,
        environmentPrompt: input.environmentPrompt ?? null,
        significance: input.significance ?? null,
        mapNodeId: input.mapNodeId ?? null,
        sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
        source: "manual",
      },
    });
    return this.projectScene(row);
  }

  async updateScene(novelId: string, sceneId: string, input: {
    name?: string;
    sceneType?: string | null;
    summary?: string | null;
    environmentPrompt?: string | null;
    significance?: string | null;
    mapNodeId?: string | null;
  }): Promise<StorySettingsScene> {
    const row = await prisma.novelScene.findFirst({ where: { id: sceneId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个场景。", 404);
    }
    const updated = await prisma.novelScene.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sceneType !== undefined ? { sceneType: input.sceneType } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.environmentPrompt !== undefined ? { environmentPrompt: input.environmentPrompt } : {}),
        ...(input.significance !== undefined ? { significance: input.significance } : {}),
        ...(input.mapNodeId !== undefined ? { mapNodeId: input.mapNodeId } : {}),
      },
    });
    return this.projectScene(updated);
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
    return rows.map((row) => ({
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
      sortOrder: row.sortOrder,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
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
  }): Promise<StorySettingsProp> {
    await requireNovel(novelId);
    const maxOrder = await prisma.novelProp.findFirst({
      where: { novelId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
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
    return this.projectProp(row, ownerName);
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
  }): Promise<StorySettingsProp> {
    const row = await prisma.novelProp.findFirst({ where: { id: propId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个道具。", 404);
    }
    const updated = await prisma.novelProp.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.propType !== undefined ? { propType: input.propType ?? "object" } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.plotFunction !== undefined ? { plotFunction: input.plotFunction } : {}),
        ...(input.visualPrompt !== undefined ? { visualPrompt: input.visualPrompt } : {}),
        ...(input.ownerCharacterId !== undefined ? { ownerCharacterId: input.ownerCharacterId } : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        ...(input.firstAppearHint !== undefined ? { firstAppearHint: input.firstAppearHint } : {}),
      },
    });
    const ownerName = updated.ownerCharacterId
      ? (await prisma.character.findUnique({
        where: { id: updated.ownerCharacterId },
        select: { name: true },
      }))?.name ?? null
      : null;
    return this.projectProp(updated, ownerName);
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
        personality: true,
        appearance: true,
        background: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  }

  async createCharacter(novelId: string, input: {
    name: string;
    role: string;
    gender?: string | null;
    ageGroup?: string | null;
    physique?: string | null;
    attireStyle?: string | null;
    facePrompt?: string | null;
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
  }): Promise<StorySettingsCharacter> {
    await requireNovel(novelId);
    const row = await prisma.character.create({
      data: {
        novelId,
        name: input.name,
        role: input.role,
        gender: normalizeCharacterGender(input.gender),
        ageGroup: normalizeCharacterAgeGroup(input.ageGroup),
        physique: input.physique ?? null,
        attireStyle: input.attireStyle ?? null,
        facePrompt: input.facePrompt ?? null,
        personality: input.personality ?? null,
        appearance: input.appearance ?? null,
        background: input.background ?? null,
      },
    });
    return this.projectCharacter(row);
  }

  async updateCharacter(novelId: string, characterId: string, input: {
    name?: string;
    role?: string;
    gender?: string | null;
    ageGroup?: string | null;
    physique?: string | null;
    attireStyle?: string | null;
    facePrompt?: string | null;
    personality?: string | null;
    appearance?: string | null;
    background?: string | null;
  }): Promise<StorySettingsCharacter> {
    const row = await prisma.character.findFirst({ where: { id: characterId, novelId } });
    if (!row) {
      throw new AppError("没有找到这个角色。", 404);
    }
    const updated = await prisma.character.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.gender !== undefined ? { gender: normalizeCharacterGender(input.gender) } : {}),
        ...(input.ageGroup !== undefined ? { ageGroup: normalizeCharacterAgeGroup(input.ageGroup) } : {}),
        ...(input.physique !== undefined ? { physique: input.physique } : {}),
        ...(input.attireStyle !== undefined ? { attireStyle: input.attireStyle } : {}),
        ...(input.facePrompt !== undefined ? { facePrompt: input.facePrompt } : {}),
        ...(input.personality !== undefined ? { personality: input.personality } : {}),
        ...(input.appearance !== undefined ? { appearance: input.appearance } : {}),
        ...(input.background !== undefined ? { background: input.background } : {}),
      },
    });
    return this.projectCharacter(updated);
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
        map: { overview: "", nodes: [], edges: [] },
        source: "ai",
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      premise: row.premise,
      era: row.era,
      toneRules: parseJsonArray(row.toneRulesJson),
      keySettings: parseKeySettings(row.keySettingsJson),
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
  }): Promise<StorySettingsWorldMapView> {
    await requireNovel(novelId);
    const data = {
      ...(input.premise !== undefined ? { premise: input.premise } : {}),
      ...(input.era !== undefined ? { era: input.era } : {}),
      ...(input.toneRules !== undefined ? { toneRulesJson: JSON.stringify(input.toneRules) } : {}),
      ...(input.keySettings !== undefined ? { keySettingsJson: JSON.stringify(input.keySettings) } : {}),
    };
    if (Object.keys(data).length === 0) {
      return this.getWorld(novelId);
    }
    await prisma.novelSettingsWorld.upsert({
      where: { novelId },
      create: {
        novelId,
        premise: input.premise ?? "",
        era: input.era ?? null,
        toneRulesJson: JSON.stringify(input.toneRules ?? []),
        keySettingsJson: JSON.stringify(input.keySettings ?? []),
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
    await this.persistCategories(novelId, bundle, missing, { replace: false });
    return { generated: missing };
  }

  // 按类别重建：场景/道具/世界观整体替换；角色只补充缺失（不删除已有角色，保护关系数据）。
  async regenerate(novelId: string, category: StorySettingsCategory): Promise<void> {
    const novel = await requireNovel(novelId);
    const bundle = await this.generateBundle(novel, novelId);
    await this.persistCategories(novelId, bundle, [category], { replace: true });
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
          ? existingCharacters.map((character) => `${character.name}（${character.role}）`)
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

  private async persistCategories(
    novelId: string,
    bundle: StorySettingsBundleOutput,
    categories: StorySettingsCategory[],
    options: { replace: boolean },
  ): Promise<void> {
    const locationIdByName = new Map(bundle.world.mapLocations.map((location) => [location.name, location.id]));

    if (categories.includes("world")) {
      await prisma.novelSettingsWorld.upsert({
        where: { novelId },
        create: {
          novelId,
          premise: bundle.world.premise,
          era: bundle.world.era,
          toneRulesJson: JSON.stringify(bundle.world.toneRules),
          keySettingsJson: JSON.stringify(bundle.world.keySettings),
          mapJson: JSON.stringify({ nodes: bundle.world.mapLocations, edges: bundle.world.mapEdges }),
          source: "ai",
        },
        update: {
          premise: bundle.world.premise,
          era: bundle.world.era,
          toneRulesJson: JSON.stringify(bundle.world.toneRules),
          keySettingsJson: JSON.stringify(bundle.world.keySettings),
          mapJson: JSON.stringify({ nodes: bundle.world.mapLocations, edges: bundle.world.mapEdges }),
          source: "ai",
        },
      });
    }

    if (categories.includes("characters")) {
      const existingNames = new Set(
        (await prisma.character.findMany({
          where: { novelId },
          select: { name: true },
        })).map((character) => character.name),
      );
      const newCharacters = bundle.characters.filter((character) => !existingNames.has(character.name));
      if (newCharacters.length > 0) {
        await prisma.character.createMany({
          data: newCharacters.map((character) => ({
            novelId,
            name: character.name,
            role: character.role,
            gender: character.gender ?? "unknown",
            ageGroup: character.ageGroup ?? null,
            physique: character.physique ?? null,
            attireStyle: character.attireStyle ?? null,
            facePrompt: character.facePrompt ?? null,
            personality: character.personality,
            appearance: character.appearance ?? null,
            background: character.background ?? null,
          })),
        });
      }
    }

    if (categories.includes("scenes")) {
      if (options.replace) {
        await prisma.novelScene.deleteMany({ where: { novelId } });
      }
      await prisma.novelScene.createMany({
        data: bundle.scenes.map((scene, index) => ({
          novelId,
          name: scene.name,
          sceneType: scene.sceneType ?? null,
          summary: scene.summary,
          environmentPrompt: scene.environmentPrompt ?? null,
          significance: scene.significance,
          mapNodeId: locationIdByName.get(scene.mapLocationName) ?? null,
          sortOrder: index + 1,
          source: "ai",
        })),
      });
    }

    if (categories.includes("props")) {
      if (options.replace) {
        await prisma.novelProp.deleteMany({ where: { novelId } });
      }
      const characterIdByName = new Map(
        (await prisma.character.findMany({
          where: { novelId },
          select: { id: true, name: true },
        })).map((character) => [character.name, character.id] as const),
      );
      await prisma.novelProp.createMany({
        data: bundle.props.map((prop, index) => ({
          novelId,
          name: prop.name,
          propType: prop.propType ?? "object",
          description: prop.description,
          plotFunction: prop.plotFunction,
          visualPrompt: prop.visualPrompt ?? null,
          ownerCharacterId: prop.ownerCharacterName
            ? characterIdByName.get(prop.ownerCharacterName) ?? null
            : null,
          importance: prop.importance,
          firstAppearHint: prop.firstAppearHint ?? null,
          sortOrder: index + 1,
          source: "ai",
        })),
      });
    }
  }

  private projectCharacter(row: {
    id: string;
    name: string;
    role: string;
    gender: string | null;
    ageGroup: string | null;
    physique: string | null;
    attireStyle: string | null;
    facePrompt: string | null;
    personality: string | null;
    appearance: string | null;
    background: string | null;
    updatedAt: Date;
  }): StorySettingsCharacter {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      gender: row.gender,
      ageGroup: row.ageGroup,
      physique: row.physique,
      attireStyle: row.attireStyle,
      facePrompt: row.facePrompt,
      personality: row.personality,
      appearance: row.appearance,
      background: row.background,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private projectScene(row: {
    id: string;
    name: string;
    sceneType: string | null;
    summary: string | null;
    environmentPrompt: string | null;
    significance: string | null;
    mapNodeId: string | null;
    sortOrder: number;
    source: string;
    updatedAt: Date;
  }): StorySettingsScene {
    return {
      id: row.id,
      name: row.name,
      sceneType: row.sceneType,
      summary: row.summary,
      environmentPrompt: row.environmentPrompt,
      significance: row.significance,
      mapNodeId: row.mapNodeId,
      sortOrder: row.sortOrder,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private projectProp(
    row: {
      id: string;
      name: string;
      propType: string;
      description: string | null;
      plotFunction: string | null;
      visualPrompt: string | null;
      ownerCharacterId: string | null;
      importance: string;
      firstAppearHint: string | null;
      sortOrder: number;
      source: string;
      updatedAt: Date;
    },
    ownerCharacterName: string | null,
  ): StorySettingsProp {
    return {
      id: row.id,
      name: row.name,
      propType: row.propType,
      description: row.description,
      plotFunction: row.plotFunction,
      visualPrompt: row.visualPrompt,
      ownerCharacterId: row.ownerCharacterId,
      ownerCharacterName,
      importance: row.importance,
      firstAppearHint: row.firstAppearHint,
      sortOrder: row.sortOrder,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const storySettingsService = new StorySettingsService();
