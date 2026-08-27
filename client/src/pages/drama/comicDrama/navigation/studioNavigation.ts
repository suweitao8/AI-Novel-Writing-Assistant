export type StudioStage = "current" | "assets" | "settings";
export type AssetTab = "characters" | "scenes" | "props";
export type CurrentTab = "reference" | "extract" | "script" | "storyboard" | "video";
export type SettingsTab = "world" | "map" | "general";

/** 项目级页签与各阶段子页签的显示文案；顶部导航栏二级/三级页签共用同一份。 */
export const STUDIO_STAGE_LABELS: Record<StudioStage, string> = {
  current: "当前",
  assets: "资产",
  settings: "设定",
};

export const CURRENT_TAB_LABELS: Record<CurrentTab, string> = {
  reference: "参考",
  extract: "提取",
  script: "脚本",
  storyboard: "分镜",
  video: "视频",
};

export const ASSET_TAB_LABELS: Record<AssetTab, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
};

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  world: "世界观",
  map: "地图",
  general: "通用",
};

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
