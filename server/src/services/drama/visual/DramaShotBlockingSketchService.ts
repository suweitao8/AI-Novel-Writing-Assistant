import fs from "fs/promises";
import path from "path";
import {
  normalizeStoryAssetStates,
  parseStoryAssetStatesJson,
  type StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { stateImageUrl } from "../../../modules/novel/story-settings/application/StoryAssetStateImageStorage";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { loadNovelCharacterStatesByName } from "../DramaContextAssembler";
import { safeJsonParse } from "../utils/json";
import {
  normalizeBlockingSketchData,
  parseBlockingSketchData,
  type DramaShotBlockingSketchActor,
  type DramaShotBlockingSketchData,
} from "./DramaShotBlockingSketchContracts";

const DRAMA_SHOT_IMAGES_DIR = "drama-shots";
const BLOCKING_SKETCH_FILE = "blocking-sketch.png";
const MAX_BLOCKING_SKETCH_BYTES = 12 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface CharacterLite {
  id: string;
  name: string;
  portraitData?: string | null;
}

interface BlockingSketchShot {
  id: string;
  location: string | null;
  characterRefs: string | null;
  characterStates: string | null;
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
}

export interface BlockingSketchEditorActor {
  characterName: string;
  assetId?: string;
  stateId?: string;
  imageUrl?: string;
  sourceImageKind: "state_sheet" | "portrait" | "placeholder";
}

export interface DramaShotBlockingSketchEditorContext {
  sketch: DramaShotBlockingSketchData | null;
  scene: BlockingSketchEditorScene | null;
  actors: BlockingSketchEditorActor[];
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
      include: {
        storyboard: {
          include: {
            project: { include: { characters: { select: { id: true, name: true, portraitData: true } } } },
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
      return {
        sketch,
        scene: null,
        actors: selectReferencedCharacters(shot).map((character) => ({
          characterName: character.name,
          assetId: character.id,
          ...(resolvePortraitUrl(character) ? { imageUrl: resolvePortraitUrl(character)! } : {}),
          sourceImageKind: resolvePortraitUrl(character) ? "portrait" : "placeholder",
        })),
      };
    }

    const novelId = project.sourceRef.trim();
    const [sceneRows, statesByName] = await Promise.all([
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
        },
      }),
      loadNovelCharacterStatesByName(novelId),
    ]);
    const sceneCandidates = sceneRows.map((scene) => ({
      name: scene.name,
      assetId: scene.id,
      state: selectSceneState(scene.statesJson, scene),
    })).filter((scene): scene is { name: string; assetId: string; state: StoryAssetState } => Boolean(scene.state));
    const matchedScene = matchSceneByName(sceneCandidates, shot.location);
    const scene = matchedScene?.state.image?.status === "done" && matchedScene.state.image.url?.trim()
      ? {
        name: matchedScene.name,
        assetId: matchedScene.assetId,
        stateId: matchedScene.state.id,
        imageUrl: stateImageUrl(novelId, "scene", matchedScene.assetId, matchedScene.state.id),
      }
      : null;

    const activeStateNames = parseShotCharacterStates(shot.characterStates);
    const actors = selectReferencedCharacters(shot).map((character): BlockingSketchEditorActor => {
      const states = statesByName.get(character.name.trim()) ?? [];
      const stateName = activeStateNames.get(character.name.trim());
      const activeState = (stateName ? states.find((state) => state.label.trim() === stateName) : undefined) ?? states[0];
      const stateUrl = activeState?.image?.status === "done" && activeState.image.url?.trim()
        ? activeState.image.url.trim()
        : null;
      const portraitUrl = resolvePortraitUrl(character);
      return {
        characterName: character.name,
        assetId: character.id,
        ...(activeState ? { stateId: activeState.id } : {}),
        ...(stateUrl || portraitUrl ? { imageUrl: stateUrl ?? portraitUrl ?? undefined } : {}),
        sourceImageKind: stateUrl ? "state_sheet" : portraitUrl ? "portrait" : "placeholder",
      };
    });

    return { sketch, scene, actors };
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

export const dramaShotBlockingSketchService = new DramaShotBlockingSketchService();
