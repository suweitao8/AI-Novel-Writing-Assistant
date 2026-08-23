import type { ScriptItem } from "@ai-novel/shared/utils/scriptDocument";

type AssetKind = "character" | "scene" | "prop";

interface NamedAsset {
  name: string;
}

export interface ScriptAssetUsageInput {
  items: ScriptItem[];
  characters: NamedAsset[];
  scenes: NamedAsset[];
  props: NamedAsset[];
}

export interface ScriptAssetUsage {
  knownCharacters: Set<string>;
  knownScenes: Set<string>;
  usedOrderKeys: string[];
  usedKeys: Set<string>;
  missing: Array<{ type: "character" | "scene"; name: string }>;
}

export function collectScriptAssetUsage(input: ScriptAssetUsageInput): ScriptAssetUsage {
  const knownCharacters = new Set(input.characters.map((character) => character.name.trim()));
  const knownScenes = new Set(input.scenes.map((scene) => scene.name.trim()));
  const usedOrderKeys: string[] = [];
  const usedKeys = new Set<string>();
  const missingScenes: string[] = [];
  const missingCharacters: string[] = [];
  const pushUsed = (key: string) => {
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      usedOrderKeys.push(key);
    }
  };

  const assetKindsByName = new Map<string, AssetKind[]>();
  const registerAssetNames = (kind: AssetKind, names: string[]) => {
    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      const kinds = assetKindsByName.get(name) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      assetKindsByName.set(name, kinds);
    }
  };
  registerAssetNames("character", input.characters.map((character) => character.name));
  registerAssetNames("scene", input.scenes.map((scene) => scene.name));
  registerAssetNames("prop", input.props.map((prop) => prop.name));

  const mentionNames = [...assetKindsByName.keys()].sort((left, right) => right.length - left.length);
  const mentionPattern = mentionNames.length > 0
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${mentionNames.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "gu")
    : null;
  const pushMentionedAssets = (sourceText: string) => {
    if (!mentionPattern || !sourceText) return;
    for (const match of sourceText.matchAll(mentionPattern)) {
      for (const kind of assetKindsByName.get(match[0]) ?? []) {
        pushUsed(`${kind}:${match[0]}`);
      }
    }
  };
  const pushStructuredAsset = (kind: "character" | "scene", rawName: string) => {
    const name = rawName.trim();
    if (name && assetKindsByName.get(name)?.includes(kind)) {
      pushUsed(`${kind}:${name}`);
    }
  };

  for (const item of input.items) {
    let sourceText = "";
    if (item.kind === "scene") {
      const name = item.scene.trim();
      sourceText = name;
      if (knownScenes.has(name)) {
        pushStructuredAsset("scene", name);
      } else if (name && !missingScenes.includes(name)) {
        missingScenes.push(name);
      }
    } else if (item.kind === "sceneState") {
      const name = item.scene.trim();
      sourceText = `${name} ${item.state}`;
      if (knownScenes.has(name)) {
        pushStructuredAsset("scene", name);
      } else if (name && !missingScenes.includes(name)) {
        missingScenes.push(name);
      }
    } else if (item.kind === "line") {
      const name = item.speaker.trim();
      sourceText = `${name} ${item.mood} ${item.text}`;
      if (name && name !== "旁白" && knownCharacters.has(name)) {
        pushStructuredAsset("character", name);
      } else if (name && name !== "旁白" && !missingCharacters.includes(name)) {
        missingCharacters.push(name);
      }
    } else if (item.kind === "state") {
      const name = item.name.trim();
      sourceText = `${name} ${item.state}`;
      if (name && knownCharacters.has(name)) {
        pushStructuredAsset("character", name);
      } else if (name && !missingCharacters.includes(name)) {
        missingCharacters.push(name);
      }
    } else if (item.kind === "shot") {
      sourceText = `${item.shot} ${item.storyboard}`;
    } else {
      sourceText = item.text;
    }
    pushMentionedAssets(sourceText);
  }

  return {
    knownCharacters,
    knownScenes,
    usedOrderKeys,
    usedKeys,
    missing: [
      ...missingScenes.map((name) => ({ type: "scene" as const, name })),
      ...missingCharacters.map((name) => ({ type: "character" as const, name })),
    ],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
