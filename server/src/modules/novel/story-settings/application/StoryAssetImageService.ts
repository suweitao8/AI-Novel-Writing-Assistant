// 兼容旧版设定资产参考图生成：场景全景与道具透视图仍保留接口和落盘文件，避免历史数据失效。
// 当前漫剧工作室的正式场景图片由 StoryAssetStateImageService 按 statesJson 的状态生成；
// 道具旧版透视图仍存 NovelProp.imageData（GeneratedImageState JSON），角色状态图由
// StoryAssetStateImageService 生成并通过本地固定模板合成。
// 旧版场景全景状态仍存 NovelScene.imageData（GeneratedImageState JSON），
// 文件落 generated-images/story-assets/{scenes|props}/<id>/，画风走两层组合
// （dramaArtStyleResolver：通用质感 + 本小说默认具体风格）。
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runImageGeneration, safeJsonParse, parseImageStateSummary, type GeneratedImageState, type ImageTargetAdapter } from "../../../../services/image/runtime";
import { IMAGE_SPECS } from "../../../../services/image/imageSpecs";
import { resolveGeneratedImagesRoot } from "../../../../runtime/appPaths";
import { resolveDramaArtStyleContext } from "../../../../services/drama/visual/dramaArtStyleResolver";
import { combineStyleAvoidInstructions } from "../../../../services/drama/visual/dramaVisualStyles";
import { resolveAssetImageProvider } from "../../../../services/image/assetProviderRouting";

const SCENE_DIR = "scenes";
const PROP_DIR = "props";
const IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

/** 列表/详情返回给前端的精简图片状态（没有生成记录时为 null）。 */
export interface StoryAssetImageState {
  status: string;
  url?: string;
}

export function parseStoryAssetImage(value: string | null | undefined): StoryAssetImageState | null {
  return parseImageStateSummary(value);
}

function assetDir(kind: "scene" | "prop", assetId: string): string {
  return path.join(resolveGeneratedImagesRoot(), "story-assets", kind === "scene" ? SCENE_DIR : PROP_DIR, assetId);
}

function assetImageUrl(novelId: string, kind: "scene" | "prop", assetId: string): string {
  return `/api/novels/${novelId}/settings/${kind === "scene" ? "scenes" : "props"}/${assetId}/image`;
}

async function removeOldFiles(dir: string, base: string, keepExt: string): Promise<void> {
  for (const [ext] of IMAGE_EXTS) {
    if (ext === keepExt) continue;
    await fs.unlink(path.join(dir, `${base}.${ext}`)).catch(() => {});
  }
}

async function resolveAssetFile(kind: "scene" | "prop", assetId: string, base: string): Promise<{ filePath: string; mimeType: string } | null> {
  const dir = assetDir(kind, assetId);
  for (const [ext, mimeType] of IMAGE_EXTS) {
    const candidate = path.join(dir, `${base}.${ext}`);
    try {
      await fs.access(candidate);
      return { filePath: candidate, mimeType };
    } catch { /* 换下一个扩展名 */ }
  }
  return null;
}

function buildStyleLines(universal: { styleTag: string; styleInstructions: string }, specific: { styleTag?: string; styleInstructions: string } | null): string[] {
  const tags = [universal.styleTag, specific?.styleTag].filter(Boolean).join(", ");
  return [tags, universal.styleInstructions, ...(specific ? [specific.styleInstructions] : [])];
}

// 时间/天气 → 光线描述（结构化字段转生图语言；两项都未设定时不加，交给图片提示词本身）。
const TIME_LIGHT_LINES: Record<string, string> = {
  morning: "soft morning light, low warm sun angle",
  noon: "bright midday light, high sun",
  night: "night scene, dim artificial lighting and dark sky",
};
const WEATHER_LIGHT_LINES: Record<string, string> = {
  sunny: "clear sunny sky, bright natural light",
  cloudy: "overcast sky, soft diffused light",
  rainy: "rainy weather, wet reflective surfaces, gloomy light",
};

function sanitizeSceneEnvironmentDescription(value: string): string {
  return value
    .replace(/(?:巨型|大型|带血角|血角|凶猛)*(?:猛兽|怪物|异兽|野兽|动物|生物)/giu, "地面爪痕与破坏痕迹")
    .replace(/人物|角色|人类|行人|人群/gu, "活动痕迹")
    .replace(/\b(?:people|person|character|characters|animal|animals|monster|monsters|creature|creatures|beast|beasts|crowd|crowds)\b/giu, "environmental traces");
}

export function buildScenePanoramaPrompt(scene: {
  name: string;
  environmentPrompt: string | null;
  timeOfDay: string | null;
  weather: string | null;
}, styleLines: string[]): string {
  const lines: string[] = [
    `360-degree panorama of the scene: ${scene.name}`,
    "seamless horizontal wrap-around view of the whole space, equirectangular panorama style",
    "camera at eye level in the center of the location, full horizon coverage showing the front, both sides and the back of the space in one continuous image",
    "consistent palette, materials, architecture and lighting across the entire panorama",
    "pure empty environment reference, no people, no characters, no animals, no monsters, no creatures, no crowds, no living subjects, no humanoid silhouettes",
    "living subjects stay off-screen; translate narrative entities into environmental traces such as footprints, claw marks, blood stains, disturbed vegetation and damaged structures",
  ];
  if (scene.timeOfDay && TIME_LIGHT_LINES[scene.timeOfDay]) {
    lines.push(TIME_LIGHT_LINES[scene.timeOfDay]);
  }
  if (scene.weather && WEATHER_LIGHT_LINES[scene.weather]) {
    lines.push(WEATHER_LIGHT_LINES[scene.weather]);
  }
  if (scene.environmentPrompt?.trim()) {
    lines.push(`environment-only description: ${sanitizeSceneEnvironmentDescription(scene.environmentPrompt.trim())}`);
  }
  lines.push(...styleLines);
  lines.push("clean composition, no text labels, no watermark, high quality environment art");
  return lines.join(", ");
}

function buildPropViewPrompt(prop: { name: string; visualPrompt: string | null }, styleLines: string[]): string {
  const lines: string[] = [
    `single prop design reference: ${prop.name}`,
    "one object only, centered, 45-degree three-quarter perspective view",
    "clear silhouette with material, texture and color detail, neutral studio background",
  ];
  if (prop.visualPrompt?.trim()) {
    lines.push(`prop description: ${prop.visualPrompt.trim()}`);
  }
  lines.push(...styleLines);
  lines.push("no hands, no characters, no text labels, no watermark");
  return lines.join(", ");
}

export class StoryAssetImageService {
  /** 生成场景 360° 全景参考图（同步等待完成，状态随 NovelScene.imageData 持久化）。 */
  async generateSceneImage(novelId: string, sceneId: string, provider?: string): Promise<StoryAssetImageState | null> {
    const scene = await prisma.novelScene.findFirst({ where: { id: sceneId, novelId } });
    if (!scene) {
      throw new AppError("没有找到这个场景。", 404);
    }
    const styleContext = await resolveDramaArtStyleContext({ visualStyle: null, sourceRef: novelId });
    const prompt = buildScenePanoramaPrompt(scene, buildStyleLines(styleContext.universal, styleContext.specific));
    const adapter: ImageTargetAdapter<GeneratedImageState> = {
      kind: `story.scene:${sceneId}`,
      loadState: async () => safeJsonParse<GeneratedImageState>(scene.imageData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.novelScene.update({ where: { id: sceneId }, data: { imageData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(assetDir("scene", sceneId), "scene-panorama." + ext),
      publicUrl: () => assetImageUrl(novelId, "scene", sceneId),
      cleanupOtherExts: (keepExt) => removeOldFiles(assetDir("scene", sceneId), "scene-panorama", keepExt),
    };
    await runImageGeneration(adapter, {
      provider: provider ?? resolveAssetImageProvider({ kind: "scene", hasReference: false }),
      prompt,
      size: IMAGE_SPECS.scenePanorama,
      negativePrompt: combineStyleAvoidInstructions(styleContext.universal, styleContext.specific),
    });
    const row = await prisma.novelScene.findUnique({ where: { id: sceneId }, select: { imageData: true } });
    return parseStoryAssetImage(row?.imageData);
  }

  /** 生成道具 45° 透视参考图。 */
  async generatePropImage(novelId: string, propId: string, provider?: string): Promise<StoryAssetImageState | null> {
    const prop = await prisma.novelProp.findFirst({ where: { id: propId, novelId } });
    if (!prop) {
      throw new AppError("没有找到这个道具。", 404);
    }
    const styleContext = await resolveDramaArtStyleContext({ visualStyle: null, sourceRef: novelId });
    const prompt = buildPropViewPrompt(prop, buildStyleLines(styleContext.universal, styleContext.specific));
    const adapter: ImageTargetAdapter<GeneratedImageState> = {
      kind: `story.prop:${propId}`,
      loadState: async () => safeJsonParse<GeneratedImageState>(prop.imageData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.novelProp.update({ where: { id: propId }, data: { imageData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(assetDir("prop", propId), "prop-view." + ext),
      publicUrl: () => assetImageUrl(novelId, "prop", propId),
      cleanupOtherExts: (keepExt) => removeOldFiles(assetDir("prop", propId), "prop-view", keepExt),
    };
    await runImageGeneration(adapter, {
      provider: provider ?? resolveAssetImageProvider({ kind: "prop", hasReference: false }),
      prompt,
      size: IMAGE_SPECS.characterAsset,
      negativePrompt: combineStyleAvoidInstructions(styleContext.universal, styleContext.specific),
    });
    const row = await prisma.novelProp.findUnique({ where: { id: propId }, select: { imageData: true } });
    return parseStoryAssetImage(row?.imageData);
  }

  async serveSceneImage(novelId: string, sceneId: string): Promise<{ filePath: string; mimeType: string }> {
    const resolved = await resolveAssetFile("scene", sceneId, "scene-panorama");
    if (!resolved) {
      throw new AppError("场景图片未生成。", 404);
    }
    return resolved;
  }

  async servePropImage(novelId: string, propId: string): Promise<{ filePath: string; mimeType: string }> {
    const resolved = await resolveAssetFile("prop", propId, "prop-view");
    if (!resolved) {
      throw new AppError("道具图片未生成。", 404);
    }
    return resolved;
  }
}

export const storyAssetImageService = new StoryAssetImageService();
