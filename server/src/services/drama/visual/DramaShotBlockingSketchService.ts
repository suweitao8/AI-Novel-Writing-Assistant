import fs from "fs/promises";
import path from "path";
import {
  parseStoryAssetStatesJson,
  hasStoryAssetStateImageUrl,
  type StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import {
  isStoryScene3DMarkerSetCurrent,
  type StoryScene3DEnvironment,
  type StoryScene3DMarker,
  type StoryScene3DMarkerSet,
} from "@ai-novel/shared/types/comicDrama";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  dramaShotBlockingAutoPlanPrompt,
  type DramaShotBlockingAutoPlanOutput,
} from "../../../prompting/prompts/drama/shotBlockingAutoPlan.prompts";
import { stateImageUrl } from "../../../platform/assets/StoryAssetStateImageStorage";
import {
  anchorBlockingCameraAtProjectionCenter,
  clampBlockingActorPositionToStage,
  resolveBlockingCameraWorldPlacement,
  resolveStoryScene3DActorStageRadius,
} from "@ai-novel/shared/utils/blockingStage";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import type { DramaLLMOptions } from "../DramaStrategyService";
import { loadNovelCharacterStatesByName } from "../DramaContextAssembler";
import { safeJsonParse } from "../utils/json";
import {
  CHARACTER_HEIGHT_DEFAULT_METERS,
  ensureDramaCharacterHeightProfiles,
  ensureNovelCharacterHeightProfiles,
  heightToProxyScale,
  resolveCharacterHeightForState,
  type CharacterHeightProfileSource,
} from "./CharacterHeightProfileService";
import {
  normalizeBlockingSketch3dLayout,
  normalizeBlockingSketchData,
  parseBlockingSketchData,
  type DramaShotBlockingSketch3DCamera,
  type DramaShotBlockingSketch3DLayout,
  type DramaShotBlockingSketchActor,
  type DramaShotBlockingSketchData,
  type DramaShotBlockingSketch3DActor,
  type DramaShotBlockingSketchPose,
} from "./DramaShotBlockingSketchContracts";
import { resolveStoryScene3dEnvironment } from "@ai-novel/shared/utils/scene3dEnvironment";
import { normalizeSceneStates, storyAssetStateImageUpdatedAt } from "@ai-novel/shared/utils/storyAssetSceneStates";

const DRAMA_SHOT_IMAGES_DIR = "drama-shots";
const BLOCKING_SKETCH_FILE = "blocking-sketch.png";
const MAX_BLOCKING_SKETCH_BYTES = 12 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface CharacterLite {
  id: string;
  name: string;
  portraitData?: string | null;
  archetype?: string | null;
  persona?: string | null;
  speechStyle?: string | null;
  visualAnchor?: string | null;
  relations?: string | null;
}

interface BlockingSketchShot {
  id: string;
  order: number;
  shotSize: string | null;
  action: string;
  dialogue: string | null;
  location: string | null;
  characterRefs: string | null;
  characterStates: string | null;
  visualPrompt: string | null;
  blockingSketchData: string | null;
  storyboard: {
    project: {
      id: string;
      source: string;
      sourceRef: string | null;
      characters: CharacterLite[];
    };
  };
}

export interface DramaShotBlockingSketchShotSummary {
  order: number;
  location: string;
  shotSize: string;
  action: string;
  dialogue: string;
  visualPrompt: string;
}

export function buildDramaShotBlockingEditorShotSummary(
  shot: Pick<BlockingSketchShot, "order" | "location" | "shotSize" | "action" | "dialogue" | "visualPrompt">,
): DramaShotBlockingSketchShotSummary {
  return {
    order: shot.order,
    location: shot.location ?? "",
    shotSize: shot.shotSize ?? "",
    action: shot.action ?? "",
    dialogue: shot.dialogue ?? "",
    visualPrompt: shot.visualPrompt ?? "",
  };
}

interface BlockingSketchEditorScene {
  name: string;
  assetId: string;
  stateId: string;
  imageUrl: string;
  /** 当前场景状态图的生成时间：客户端保存草图时写入版本标记。 */
  imageUpdatedAt: string | null;
  environment: StoryScene3DEnvironment;
  markers: StoryScene3DMarker[];
  markerAnalysis: StoryScene3DMarkerSet | null;
}

export interface BlockingSketchEditorActor {
  characterName: string;
  assetId?: string;
  stateId?: string;
  imageUrl?: string;
  sourceImageKind: "state_sheet" | "portrait" | "placeholder";
  heightMeters: number;
  heightSource: CharacterHeightProfileSource | "manual" | "legacy";
  heightConfidence?: number;
}

export interface DramaShotBlockingSketchEditorContext {
  sketch: DramaShotBlockingSketchData | null;
  shot: DramaShotBlockingSketchShotSummary;
  scene: BlockingSketchEditorScene | null;
  actors: BlockingSketchEditorActor[];
  /** 来源小说 id（novel_import 项目），供深层编辑器常驻显示工作室页签并跳回。 */
  novelId: string | null;
}

export interface DramaShotBlockingAutoPlanResult {
  layout: DramaShotBlockingSketch3DLayout;
  compositionNote?: string;
}

function dramaShotDir(shotId: string): string {
  return path.join(resolveGeneratedImagesRoot(), DRAMA_SHOT_IMAGES_DIR, shotId);
}

function blockingSketchFilePath(shotId: string): string {
  return path.join(dramaShotDir(shotId), BLOCKING_SKETCH_FILE);
}

function blockingSketchUrl(shotId: string): string {
  return `/api/drama/shot-images/${encodeURIComponent(shotId)}/blocking-sketch`;
}

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  return typeof parsed === "string" && parsed.trim() ? [parsed.trim()] : [];
}

function parseShotCharacterStates(raw: string | null | undefined): Map<string, string> {
  const parsed = safeJsonParse<Array<{ name?: unknown; state?: unknown }>>(raw, []);
  const states = new Map<string, string>();
  if (!Array.isArray(parsed)) return states;
  for (const item of parsed) {
    if (typeof item?.name === "string" && typeof item?.state === "string" && item.name.trim() && item.state.trim()) {
      states.set(item.name.trim(), item.state.trim());
    }
  }
  return states;
}

function selectReferencedCharacters(shot: BlockingSketchShot): CharacterLite[] {
  const refs = parseCharacterRefs(shot.characterRefs);
  if (refs.length === 0) return [];
  const keys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  return shot.storyboard.project.characters.filter((character) => {
    const id = normalizeReferenceKey(character.id);
    const name = normalizeReferenceKey(character.name);
    return Boolean((id && keys.has(id)) || (name && keys.has(name)));
  });
}

function resolvePortraitUrl(character: CharacterLite): string | null {
  const portrait = safeJsonParse<{ status?: unknown; url?: unknown }>(character.portraitData, {});
  return portrait.status === "done" && typeof portrait.url === "string" && portrait.url.trim()
    ? portrait.url.trim()
    : null;
}

function matchSceneByName<T extends { name: string }>(scenes: T[], location: string | null | undefined): T | null {
  const target = location?.trim();
  if (!target) return null;
  const exact = scenes.find((scene) => scene.name.trim() === target);
  if (exact) return exact;
  return scenes
    .filter((scene) => target.includes(scene.name.trim()))
    .sort((left, right) => right.name.trim().length - left.name.trim().length)[0] ?? null;
}

function selectSceneState(
  statesJson: string | null,
  fallback: { name: string; summary: string | null; environmentPrompt: string | null; sceneType: string | null; timeOfDay: string | null; weather: string | null },
  environment?: StoryScene3DEnvironment,
) {
  return normalizeSceneStates(parseStoryAssetStatesJson(statesJson).states, {
    name: fallback.name,
    summary: fallback.summary,
    environmentPrompt: fallback.environmentPrompt,
    sceneType: fallback.sceneType === "interior" || fallback.sceneType === "exterior" || fallback.sceneType === "nature"
      ? fallback.sceneType
      : null,
    timeOfDay: fallback.timeOfDay === "morning" || fallback.timeOfDay === "noon" || fallback.timeOfDay === "night"
      ? fallback.timeOfDay
      : null,
    weather: fallback.weather === "sunny" || fallback.weather === "cloudy" || fallback.weather === "rainy"
      ? fallback.weather
      : null,
    scene3dEnvironment: environment,
  })[0] ?? null;
}

export class DramaShotBlockingSketchService {
  private async assertShotInProject(projectId: string, shotId: string): Promise<BlockingSketchShot> {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      select: {
        id: true,
        order: true,
        shotSize: true,
        action: true,
        dialogue: true,
        location: true,
        characterRefs: true,
        characterStates: true,
        visualPrompt: true,
        blockingSketchData: true,
        storyboard: {
          include: {
            project: {
              include: {
                characters: {
                  select: {
                    id: true,
                    name: true,
                    portraitData: true,
                    archetype: true,
                    persona: true,
                    speechStyle: true,
                    visualAnchor: true,
                    relations: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!shot || shot.storyboard.project.id !== projectId) {
      throw new AppError("未找到当前项目中的镜头。", 404);
    }
    return shot;
  }

  async getEditorContext(projectId: string, shotId: string): Promise<DramaShotBlockingSketchEditorContext> {
    const shot = await this.assertShotInProject(projectId, shotId);
    const project = shot.storyboard.project;
    const sketch = parseBlockingSketchData(shot.blockingSketchData);
    const shotSummary = buildDramaShotBlockingEditorShotSummary(shot);
    if (project.source !== "novel_import" || !project.sourceRef?.trim()) {
      const referencedCharacters = selectReferencedCharacters(shot);
      const heightProfilesById = await ensureDramaCharacterHeightProfiles(
        project.id,
        referencedCharacters.map((character) => character.id),
      );
      return {
        sketch,
        shot: shotSummary,
        scene: null,
        novelId: null,
        actors: referencedCharacters.map((character) => {
          const profile = heightProfilesById.get(character.id);
          const height = resolveCharacterHeightForState(undefined, profile);
          return {
            characterName: character.name,
            assetId: character.id,
            ...(resolvePortraitUrl(character) ? { imageUrl: resolvePortraitUrl(character)! } : {}),
            sourceImageKind: resolvePortraitUrl(character) ? "portrait" : "placeholder",
            ...height,
          };
        }),
      };
    }

    const novelId = project.sourceRef.trim();
    const referencedCharacters = selectReferencedCharacters(shot);
    const [sceneRows, statesByName, heightProfilesByName] = await Promise.all([
      prisma.novelScene.findMany({
        where: { novelId },
        select: {
          id: true,
          name: true,
          statesJson: true,
          summary: true,
          environmentPrompt: true,
          sceneType: true,
          timeOfDay: true,
          weather: true,
          scene3dEnvironmentJson: true,
        },
      }),
      loadNovelCharacterStatesByName(novelId),
      ensureNovelCharacterHeightProfiles(novelId, referencedCharacters.map((character) => character.name)),
    ]);
    const sceneCandidates = sceneRows.map((scene) => {
      const baseState = selectSceneState(scene.statesJson, scene);
      const environment = resolveStoryScene3dEnvironment(
        scene.sceneType,
        scene.scene3dEnvironmentJson,
        baseState?.sceneType,
      );
      const state = selectSceneState(scene.statesJson, scene, environment);
      return {
        name: scene.name,
        assetId: scene.id,
        state,
        environment,
      };
    }).filter((scene): scene is { name: string; assetId: string; state: StoryAssetState; environment: StoryScene3DEnvironment } => Boolean(scene.state));
    const matchedScene = matchSceneByName(sceneCandidates, shot.location);
    const matchedSceneState = matchedScene?.state;
    const sceneImageUrl = hasStoryAssetStateImageUrl(matchedSceneState?.image)
      ? matchedSceneState.image.url.trim()
      : null;
    const markerAnalysis = matchedSceneState?.scene3dMarkers ?? null;
    const markersAreCurrent = isStoryScene3DMarkerSetCurrent(markerAnalysis, matchedScene?.environment);
    const scene = matchedScene && sceneImageUrl
      ? {
        name: matchedScene.name,
        assetId: matchedScene.assetId,
        stateId: matchedScene.state.id,
        imageUrl: stateImageUrl(novelId, "scene", matchedScene.assetId, matchedScene.state.id),
        imageUpdatedAt: storyAssetStateImageUpdatedAt(matchedSceneState),
        environment: matchedScene.environment,
        markers: markersAreCurrent ? markerAnalysis?.markers ?? [] : [],
        markerAnalysis,
      }
      : null;

    const activeStateNames = parseShotCharacterStates(shot.characterStates);
    const actors = selectReferencedCharacters(shot).map((character): BlockingSketchEditorActor => {
      const states = statesByName.get(character.name.trim()) ?? [];
      const stateName = activeStateNames.get(character.name.trim());
      const activeState = (stateName ? states.find((state) => state.label.trim() === stateName) : undefined) ?? states[0];
      const stateUrl = hasStoryAssetStateImageUrl(activeState?.image)
        ? activeState.image.url.trim()
        : null;
      const portraitUrl = resolvePortraitUrl(character);
      const profile = heightProfilesByName.get(normalizedName(character.name));
      const height = resolveCharacterHeightForState(activeState, profile);
      return {
        characterName: character.name,
        assetId: character.id,
        ...(activeState ? { stateId: activeState.id } : {}),
        ...(stateUrl || portraitUrl ? { imageUrl: stateUrl ?? portraitUrl ?? undefined } : {}),
        sourceImageKind: stateUrl ? "state_sheet" : portraitUrl ? "portrait" : "placeholder",
        ...height,
      };
    });

    return { sketch, shot: shotSummary, scene, actors, novelId };
  }

  async autoPlan(projectId: string, shotId: string, options: DramaLLMOptions = {}): Promise<DramaShotBlockingAutoPlanResult> {
    const shot = await this.assertShotInProject(projectId, shotId);
    const context = await this.getEditorContext(projectId, shotId);
    if (!context.scene) {
      throw new AppError("当前镜头没有可用的场景状态图。", 409);
    }
    if (context.actors.length === 0) {
      throw new AppError("当前镜头没有可规划的出场角色。", 409);
    }
    const result = await runStructuredPrompt({
      asset: dramaShotBlockingAutoPlanPrompt,
      promptInput: {
        shotJson: JSON.stringify({
          order: shot.order,
          location: shot.location,
          shotSize: shot.shotSize,
          action: shot.action,
          dialogue: shot.dialogue,
          visualPrompt: shot.visualPrompt,
        }),
        sceneJson: JSON.stringify(context.scene),
        actorsJson: JSON.stringify(context.actors),
        stageRadiusMeters: resolveStoryScene3DActorStageRadius(context.scene.environment),
        projectionCenterHeight: context.scene.environment.projectionCenterHeight,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.25,
      },
    });
    return buildDramaShotBlockingAutoPlanLayout(result.output, context.actors, context.scene.environment);
  }

  async saveSketch(projectId: string, shotId: string, input: unknown): Promise<DramaShotBlockingSketchData> {
    const shot = await this.assertShotInProject(projectId, shotId);
    let normalized: DramaShotBlockingSketchData;
    try {
      normalized = normalizeBlockingSketchData(input);
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "摆位草图数据无效。", 400);
    }
    const previous = parseBlockingSketchData(shot.blockingSketchData);
    const next: DramaShotBlockingSketchData = {
      status: "draft",
      version: (previous?.version ?? 0) + 1,
      ...(normalized.compositionNote ? { compositionNote: normalized.compositionNote } : {}),
      scene: normalized.scene,
      actors: normalized.actors,
      ...(normalized.layout3d ? { layout3d: normalized.layout3d } : {}),
    };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { blockingSketchData: JSON.stringify(next) },
    });
    return next;
  }

  async uploadSketchPng(projectId: string, shotId: string, buffer: Buffer): Promise<DramaShotBlockingSketchData> {
    if (buffer.length === 0) {
      throw new AppError("未收到草图图片数据。", 400);
    }
    if (buffer.length > MAX_BLOCKING_SKETCH_BYTES) {
      throw new AppError("草图图片不能超过 12MB。", 413);
    }
    if (!isPngBuffer(buffer)) {
      throw new AppError("摆位草图仅支持 PNG 图片。", 415);
    }
    const shot = await this.assertShotInProject(projectId, shotId);
    const draft = parseBlockingSketchData(shot.blockingSketchData);
    if (!draft || draft.status !== "draft") {
      throw new AppError("请先保存当前摆位，再上传草图图片。", 409);
    }
    await fs.mkdir(dramaShotDir(shotId), { recursive: true });
    await fs.writeFile(blockingSketchFilePath(shotId), buffer);
    const next: DramaShotBlockingSketchData = {
      ...draft,
      url: blockingSketchUrl(shotId),
      generatedAt: new Date().toISOString(),
    };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { blockingSketchData: JSON.stringify(next) },
    });
    return next;
  }

  async confirmSketch(projectId: string, shotId: string): Promise<DramaShotBlockingSketchData> {
    const shot = await this.assertShotInProject(projectId, shotId);
    const draft = parseBlockingSketchData(shot.blockingSketchData);
    if (!draft?.url?.trim()) {
      throw new AppError("草图图片尚未上传，无法确认。", 409);
    }
    const resolved = await this.resolveExistingBlockingSketchPath(shotId);
    if (!resolved) {
      throw new AppError("草图图片尚未上传，无法确认。", 409);
    }
    const next: DramaShotBlockingSketchData = { ...draft, status: "confirmed" };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { blockingSketchData: JSON.stringify(next) },
    });
    return next;
  }

  async resolveExistingBlockingSketchPath(shotId: string): Promise<{ filePath: string; mimeType: "image/png" } | null> {
    const filePath = blockingSketchFilePath(shotId);
    try {
      await fs.access(filePath);
      return { filePath, mimeType: "image/png" };
    } catch {
      return null;
    }
  }
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

const AUTO_PLAN_RELATION_TYPES = new Set([
  "on_top_of",
  "under",
  "beside",
  "in_front_of",
  "behind",
  "facing",
  "holding",
  "attacking",
  "following",
]);
const AUTO_PLAN_SIZE_RELATION_TYPES = new Set(["larger", "smaller", "similar"]);
const AUTO_PLAN_ON_TOP_OF_MAX_HORIZONTAL_GAP_METERS = 0.9;
const AUTO_PLAN_ON_TOP_OF_SUPPORT_HEIGHT_RATIO = 0.18;
const AUTO_PLAN_RELATIVE_SIZE_MARGIN = 1.15;
const AUTO_PLAN_GROUND_POSES = new Set<DramaShotBlockingSketchPose>(["lying", "prone"]);
// UAL1/UAL2 has no prone animation; the client safely renders that semantic
// pose as a crouch, but auto composition should emit the supported pose
// directly so an upper actor can never be mistaken for a supine actor.
const AUTO_PLAN_UPPER_POSES = new Set<DramaShotBlockingSketchPose>(["crouching", "kneeling"]);

type DramaShotBlockingAutoPlanRelation = DramaShotBlockingAutoPlanOutput["relations"][number];

function clampAutoPlanNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function invalidAutoPlanRelation(message: string): never {
  throw new AppError(`自动构图关系无效：${message}`, 422);
}

function enforceAutoPlanRelativeSize(
  subject: DramaShotBlockingSketch3DActor,
  object: DramaShotBlockingSketch3DActor,
  sizeRelation: DramaShotBlockingAutoPlanRelation["sizeRelation"],
): void {
  if (sizeRelation === "similar") return;
  const subjectScale = subject.scale[1];
  const objectScale = object.scale[1];
  const targetScale = sizeRelation === "larger"
    ? objectScale * AUTO_PLAN_RELATIVE_SIZE_MARGIN
    : objectScale / AUTO_PLAN_RELATIVE_SIZE_MARGIN;
  const factor = sizeRelation === "larger"
    ? Math.max(1, targetScale / subjectScale)
    : Math.min(1, targetScale / subjectScale);
  if (Math.abs(factor - 1) < 1e-9) return;
  const nextScale = subject.scale.map((axis) => axis * factor) as [number, number, number];
  if (nextScale.some((axis) => axis < 0.1 || axis > 10)) {
    invalidAutoPlanRelation(
      `关系要求角色“${subject.characterName}”${sizeRelation === "larger" ? "更大" : "更小"}，但缩放会超出 3D 角色的安全范围。`,
    );
  }
  subject.scale = nextScale;
}

function enforceAutoPlanOnTopOf(
  upper: DramaShotBlockingSketch3DActor,
  grounded: DramaShotBlockingSketch3DActor,
  environment: StoryScene3DEnvironment,
): void {
  grounded.position = [grounded.position[0], 0, grounded.position[2]];
  if (!AUTO_PLAN_GROUND_POSES.has(grounded.pose)) grounded.pose = "lying";
  if (!AUTO_PLAN_UPPER_POSES.has(upper.pose)) upper.pose = "crouching";

  const dx = upper.position[0] - grounded.position[0];
  const dz = upper.position[2] - grounded.position[2];
  const horizontalGap = Math.hypot(dx, dz);
  const gapScale = horizontalGap > AUTO_PLAN_ON_TOP_OF_MAX_HORIZONTAL_GAP_METERS
    ? AUTO_PLAN_ON_TOP_OF_MAX_HORIZONTAL_GAP_METERS / horizontalGap
    : 1;
  const supportHeight = clampAutoPlanNumber(
    (grounded.heightMeters ?? CHARACTER_HEIGHT_DEFAULT_METERS) * AUTO_PLAN_ON_TOP_OF_SUPPORT_HEIGHT_RATIO,
    0.15,
    0.75,
  );
  upper.position = clampBlockingActorPositionToStage([
    grounded.position[0] + dx * gapScale,
    supportHeight,
    grounded.position[2] + dz * gapScale,
  ], environment);
}

/**
 * 把模型输出的语义关系落实为可渲染的角色几何：关系决定上下层级，
 * sizeRelation 决定实际归一化代理比例。关系只存在于本次规划结果，
 * 不写入旧的 layout3d 合同，避免把临时语义扩散到持久化快照。
 */
function enforceAutoPlanRelations(
  layoutActors: DramaShotBlockingSketch3DActor[],
  relations: readonly DramaShotBlockingAutoPlanRelation[],
  authoritativeActors: readonly BlockingSketchEditorActor[],
  environment: StoryScene3DEnvironment,
): void {
  const actorByName = new Map(layoutActors.map((actor) => [normalizedName(actor.characterName), actor]));
  const authoritativeNames = new Set(authoritativeActors.map((actor) => normalizedName(actor.characterName)));
  const relationKeys = new Set<string>();

  const resolvedRelations = relations.map((relation) => {
    const subjectName = normalizedName(relation.subjectCharacterName);
    const objectName = normalizedName(relation.objectCharacterName);
    if (!AUTO_PLAN_RELATION_TYPES.has(relation.relation)) {
      invalidAutoPlanRelation(`不支持关系“${String(relation.relation)}”。`);
    }
    if (!AUTO_PLAN_SIZE_RELATION_TYPES.has(relation.sizeRelation)) {
      invalidAutoPlanRelation(`不支持体量关系“${String(relation.sizeRelation)}”。`);
    }
    if (!subjectName || !objectName || subjectName === objectName) {
      invalidAutoPlanRelation("关系必须连接两个不同角色。");
    }
    if (!authoritativeNames.has(subjectName) || !authoritativeNames.has(objectName)) {
      invalidAutoPlanRelation("关系引用了当前镜头之外的角色。");
    }
    const subject = actorByName.get(subjectName);
    const object = actorByName.get(objectName);
    if (!subject || !object) {
      invalidAutoPlanRelation("关系引用了无法落位的角色。");
    }
    const key = `${subjectName}|${relation.relation}|${objectName}`;
    if (relationKeys.has(key)) {
      invalidAutoPlanRelation("输出包含重复的有向关系。");
    }
    relationKeys.add(key);
    return { relation, subject, object };
  });

  if (layoutActors.length > 1 && resolvedRelations.length === 0) {
    invalidAutoPlanRelation("多角色镜头不能缺少角色关系。");
  }

  for (const { relation, subject, object } of resolvedRelations) {
    if (relation.relation === "on_top_of") {
      enforceAutoPlanOnTopOf(subject, object, environment);
    } else if (relation.relation === "under") {
      enforceAutoPlanOnTopOf(object, subject, environment);
    }
  }
  for (const { relation, subject, object } of resolvedRelations) {
    enforceAutoPlanRelativeSize(subject, object, relation.sizeRelation);
  }
}

/** 导出草图固定 16:9；视野兜底按同一画幅计算，与前端取景小窗一致。 */
const SHOT_FRAME_ASPECT = 16 / 9;

/**
 * AI 构图的确定性兜底：把任一角色（脚点与头顶）都落在相机取景锥内。
 * 以取景框对角半角为几何覆盖判定——若当前 fovDeg 装不下，则只放大 fov
 * （上限 schema 的 100°），不改动模型给的方向、距离、焦点与景深创意参数。
 */
export function fitAutoPlanCameraFovToActors(
  camera: DramaShotBlockingSketch3DCamera,
  actors: ReadonlyArray<{ position: [number, number, number]; heightMeters?: number }>,
): DramaShotBlockingSketch3DCamera {
  if (actors.length === 0) return camera;
  const placement = resolveBlockingCameraWorldPlacement(camera);
  const forwardLength = Math.hypot(placement.forward[0], placement.forward[1], placement.forward[2]) || 1;
  const forward = [
    placement.forward[0] / forwardLength,
    placement.forward[1] / forwardLength,
    placement.forward[2] / forwardLength,
  ];
  let maxCos = Number.POSITIVE_INFINITY;
  for (const actor of actors) {
    const heightMeters = actor.heightMeters ?? CHARACTER_HEIGHT_DEFAULT_METERS;
    for (const sampleY of [actor.position[1] + heightMeters, actor.position[1]]) {
      const dx = actor.position[0] - placement.position[0];
      const dy = sampleY - placement.position[1];
      const dz = actor.position[2] - placement.position[2];
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-6) continue;
      const cosAngle = (dx * forward[0] + dy * forward[1] + dz * forward[2]) / length;
      maxCos = Math.min(maxCos, cosAngle);
    }
  }
  if (!Number.isFinite(maxCos)) return camera;
  // 锥角按取景框对角覆盖：tan(vFov/2)*sqrt(1+aspect²) 必须盖住最偏角色的方位角，
  // 外加 8% 视觉余量；只放宽不收紧，不触碰模型给的方向、距离、焦点与景深参数。
  const coverageTan = Math.tan((Math.max(30, Math.min(100, camera.fovDeg)) / 2) * Math.PI / 180)
    * Math.sqrt(1 + SHOT_FRAME_ASPECT * SHOT_FRAME_ASPECT);
  const requiredTan = Math.tan(Math.acos(Math.max(maxCos, -0.05))) * 1.08;
  if (requiredTan <= coverageTan) return camera;
  const widenedHalfRad = Math.atan(requiredTan / Math.sqrt(1 + SHOT_FRAME_ASPECT * SHOT_FRAME_ASPECT));
  const widenedDeg = (widenedHalfRad * 2 * 180) / Math.PI;
  return {
    ...camera,
    fovDeg: Math.max(camera.fovDeg, Math.min(100, Math.ceil(widenedDeg))),
  };
}

export function buildDramaShotBlockingAutoPlanLayout(
  output: DramaShotBlockingAutoPlanOutput,
  actors: BlockingSketchEditorActor[],
  environment: StoryScene3DEnvironment,
): DramaShotBlockingAutoPlanResult {
  const expectedNames = actors.map((actor) => actor.characterName.trim());
  const expected = new Set(expectedNames.map(normalizedName));
  const plannedNames = output.actors.map((actor) => actor.characterName.trim());
  const planned = new Set(plannedNames.map(normalizedName));
  const missing = expectedNames.filter((name) => !planned.has(normalizedName(name)));
  const extra = plannedNames.filter((name) => !expected.has(normalizedName(name)));
  if (missing.length > 0 || extra.length > 0 || planned.size !== plannedNames.length || expected.size !== expectedNames.length) {
    throw new AppError(
      `自动构图角色与当前镜头角色不一致${missing.length ? `，缺少：${missing.join("、")}` : ""}${extra.length ? `，多出：${extra.join("、")}` : ""}`,
      422,
    );
  }
  try {
    const actorByName = new Map(actors.map((actor) => [normalizedName(actor.characterName), actor]));
    // 舞台合同：角色站位（含跑动等大幅动作落点）不进入半球边缘 1 米缓冲；
    // 拍摄位锚定在投射中心，构图自由度只保留视线方向、拍摄距离与焦段。
    const stageCamera = anchorBlockingCameraAtProjectionCenter(output.camera, environment);
    const plannedActors: DramaShotBlockingSketch3DActor[] = output.actors.map((actor) => ({
      ...(() => {
        const source = actorByName.get(normalizedName(actor.characterName));
        const heightMeters = source?.heightMeters ?? CHARACTER_HEIGHT_DEFAULT_METERS;
        const baseScale = heightToProxyScale(heightMeters);
        return {
          scale: actor.scale.map((value) => Math.max(0.1, Math.min(10, value * baseScale))) as [number, number, number],
          heightMeters,
        };
      })(),
      characterName: actor.characterName.trim(),
      position: clampBlockingActorPositionToStage(actor.position, environment),
      yawDeg: actor.yawDeg,
      pose: actor.pose as DramaShotBlockingSketchPose,
      actionPlaying: false,
    }));
    enforceAutoPlanRelations(plannedActors, output.relations, actors, environment);
    const layout = normalizeBlockingSketch3dLayout({
      schemaVersion: 1,
      engine: "playcanvas",
      camera: {
        ...output.camera,
        azim: stageCamera.azim,
        elev: stageCamera.elev,
        distance: stageCamera.distance,
        focalPoint: stageCamera.focalPoint,
      },
      actors: plannedActors,
      environment,
    });
    // AI 规划后的确定性出画兜底：任何角色落在取景锥外时只放宽 fovDeg。
    layout.camera = fitAutoPlanCameraFovToActors(layout.camera, layout.actors);
    return {
      layout,
      ...(output.compositionNote?.trim() ? { compositionNote: output.compositionNote.trim() } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(error instanceof Error ? error.message : "自动构图返回了无效的 3D 布局。", 422);
  }
}

export const dramaShotBlockingSketchService = new DramaShotBlockingSketchService();
