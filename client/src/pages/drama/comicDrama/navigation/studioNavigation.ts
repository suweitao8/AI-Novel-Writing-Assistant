export type StudioStage = "current" | "assets" | "settings";
export type AssetTab = "characters" | "scenes" | "props";

const STUDIO_STAGES = ["current", "assets", "settings"] as const satisfies readonly StudioStage[];
const ASSET_TABS = ["characters", "scenes", "props"] as const satisfies readonly AssetTab[];

function parseValue<T extends string>(value: string | null, values: readonly T[]): T | null {
  return value && values.includes(value as T) ? (value as T) : null;
}

export function readStudioNavigation(search: string): {
  stage: StudioStage;
  assetTab: AssetTab;
} {
  const params = new URLSearchParams(search);
  return {
    stage: parseValue(params.get("stage"), STUDIO_STAGES) ?? "current",
    assetTab: parseValue(params.get("assetTab"), ASSET_TABS) ?? "characters",
  };
}

export function buildStudioNavigationPath(
  novelId: string,
  options: { stage: StudioStage; assetTab?: AssetTab },
): string {
  const params = new URLSearchParams({ stage: options.stage });
  if (options.stage === "assets") {
    params.set("assetTab", options.assetTab ?? "characters");
  }
  return `/drama/studio/${encodeURIComponent(novelId)}?${params.toString()}`;
}

export function buildScene3dEditorPath(novelId: string, sceneId: string, stateId: string): string {
  const params = new URLSearchParams({ returnStage: "assets", returnAssetTab: "scenes" });
  return `/drama/studio/${encodeURIComponent(novelId)}/scenes/${encodeURIComponent(sceneId)}/states/${encodeURIComponent(stateId)}/3d?${params.toString()}`;
}

export function resolveStudioReturnPath(novelId: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("returnStage") !== "assets") {
    return null;
  }
  const assetTab = parseValue(params.get("returnAssetTab"), ASSET_TABS) ?? "scenes";
  return buildStudioNavigationPath(novelId, { stage: "assets", assetTab });
}
