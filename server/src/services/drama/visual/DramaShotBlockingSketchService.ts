import fs from "fs/promises";
import path from "path";
import {
  normalizeStoryAssetStates,
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
  type DramaShotBlockingSketch3DLayout,
  type DramaShotBlockingSketchActor,
  type DramaShotBlockingSketchData,
  type DramaShotBlockingSketchPose,
} from "./DramaShotBlockingSketchContracts";
import { parseStoryScene3dEnvironment } from "../../../modules/novel/story-settings/application/StoryScene3dEnvironment";

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
  cameraMove: string | null;
  durationSec: number | null;
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

interface BlockingSketchEditorScene {
  name: string;
  assetId: string;
  stateId: string;
  imageUrl: string;
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
  scene: BlockingSketchEditorScene | null;
  actors: BlockingSketchEditorActor[];
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

function selectSceneState(statesJson: string | null, fallback: { name: string; summary: string | null; environmentPrompt: string | null; sceneType: string | null; timeOfDay: string | null; weather: string | null }) {
  return normalizeStoryAssetStates(parseStoryAssetStatesJson(statesJson).states, {
    description: fallback.summary?.trim() || fallback.environmentPrompt?.trim() || `${fallback.name}默认状态`,
    imagePrompt: fallback.environmentPrompt?.trim() || fallback.summary?.trim() || `${fallback.name}默认状态`,
    sceneType: fallback.sceneType === "interior" || fallback.sceneType === "exterior" || fallback.sceneType === "nature"
      ? fallback.sceneType
      : null,
    timeOfDay: fallback.timeOfDay === "morning" || fallback.timeOfDay === "noon" || fallback.timeOfDay === "night"
      ? fallback.timeOfDay
      : null,
    weather: fallback.weather === "sunny" || fallback.weather === "cloudy" || fallback.weather === "rainy"
      ? fallback.weather
      : null,
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
        cameraMove: true,
        durationSec: true,
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
    if (project.source !== "novel_import" || !project.sourceRef?.trim()) {
      const referencedCharacters = selectReferencedCharacters(shot);
      const heightProfilesById = await ensureDramaCharacterHeightProfiles(
        project.id,
        referencedCharacters.map((character) => character.id),
      );
      return {
        sketch,
        scene: null,
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
    const sceneCandidates = sceneRows.map((scene) => ({
      name: scene.name,
      assetId: scene.id,
      state: selectSceneState(scene.statesJson, scene),
      environment: parseStoryScene3dEnvironment(scene.scene3dEnvironmentJson),
    })).filter((scene): scene is { name: string; assetId: string; state: StoryAssetState; environment: StoryScene3DEnvironment } => Boolean(scene.state));
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

    return { sketch, scene, actors };
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
          cameraMove: shot.cameraMove,
          durationSec: shot.durationSec,
          action: shot.action,
          dialogue: shot.dialogue,
          visualPrompt: shot.visualPrompt,
        }),
        sceneJson: JSON.stringify(context.scene),
        actorsJson: JSON.stringify(context.actors),
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
    const layout = normalizeBlockingSketch3dLayout({
      schemaVersion: 1,
      engine: "playcanvas",
      camera: output.camera,
      actors: output.actors.map((actor) => ({
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
        position: actor.position,
        yawDeg: actor.yawDeg,
        pose: actor.pose as DramaShotBlockingSketchPose,
        actionPlaying: false,
      })),
      environment,
    });
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
