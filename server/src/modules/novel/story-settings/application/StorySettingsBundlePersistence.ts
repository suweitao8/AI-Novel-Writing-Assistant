import { prisma } from "../../../../db/prisma";
import type { StorySettingsBundleOutput } from "../../../../prompting/prompts/novel/storySettings.prompts";
import {
  normalizeCharacterStates,
  normalizePropStates,
  normalizeSceneStates,
  serializeStates,
} from "./StorySettingsStatePolicy";

export type StorySettingsPersistenceCategory = "characters" | "scenes" | "props" | "world";

/**
 * 把 AI 设定包写入设定中心。
 *
 * 这是持久化适配层：AI 输出的旧基础字段仍会写入兼容列，但状态资产是后续
 * 生图、配音和分镜的唯一入口，因此三类资产在批量落库时必须同步拥有初始状态。
 */
export async function persistStorySettingsCategories(
  novelId: string,
  bundle: StorySettingsBundleOutput,
  categories: StorySettingsPersistenceCategory[],
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
          voiceTexture: character.voicePrompt ?? null,
          statesJson: serializeStates(normalizeCharacterStates(undefined, {
            gender: character.gender,
            ageGroup: character.ageGroup,
            physique: character.physique,
            attireStyle: character.attireStyle,
            facePrompt: character.facePrompt,
            appearance: character.appearance,
            voiceTexture: character.voicePrompt,
          })),
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
        statesJson: serializeStates(normalizeSceneStates(undefined, {
          name: scene.name,
          summary: scene.summary,
          environmentPrompt: scene.environmentPrompt,
        })),
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
        statesJson: serializeStates(normalizePropStates(undefined, {
          name: prop.name,
          description: prop.description,
          visualPrompt: prop.visualPrompt,
        })),
        sortOrder: index + 1,
        source: "ai",
      })),
    });
  }
}
