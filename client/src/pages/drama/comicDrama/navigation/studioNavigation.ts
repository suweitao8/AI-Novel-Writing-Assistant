// 资产页签已拍平（2026-08-27 用户决定）：角色 / 场景 / 道具提升为与章节、设定
// 平级的二级页签，「资产」层不复存在；「当前」同时更名「章节」（内部值仍为 current）。
export type StudioStage = "characters" | "scenes" | "props" | "current" | "settings";
export type CurrentTab = "reference" | "extract" | "script" | "storyboard" | "video";
export type SettingsTab = "world" | "map" | "general";

/** 二级页签顺序：角色、场景、道具、章节、设定。 */
export const STUDIO_STAGE_ORDER: readonly StudioStage[] = [
  "characters",
  "scenes",
  "props",
  "current",
  "settings",
];

/** 项目级页签的显示文案；顶部导航栏二级/三级页签共用同一份。 */
export const STUDIO_STAGE_LABELS: Record<StudioStage, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
  current: "章节",
  settings: "设定",
};

export const CURRENT_TAB_LABELS: Record<CurrentTab, string> = {
  reference: "参考",
  extract: "提取",
  script: "脚本",
  storyboard: "分镜",
  video: "视频",
};

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  world: "世界观",
  map: "地图",
  general: "通用",
};

const STUDIO_STAGES: readonly StudioStage[] = STUDIO_STAGE_ORDER;

function parseValue<T extends string>(value: string | null, values: readonly T[]): T | null {
  return value && values.includes(value as T) ? (value as T) : null;
}

/**
 * 旧链接兼容：拍平前的地址是 ?stage=assets&assetTab=scenes，映射为新的
 * stage=scenes；没有 assetTab 的旧 assets 地址落在「角色」。
 */
function normalizeLegacyAssetsStage(params: URLSearchParams): StudioStage {
  const assetTab = params.get("assetTab");
  if (assetTab === "scenes") return "scenes";
  if (assetTab === "props") return "props";
  return "characters";
}

export function readStudioNavigation(search: string): { stage: StudioStage } {
  const params = new URLSearchParams(search);
  const stage = parseValue(params.get("stage"), STUDIO_STAGES);
  if (stage) {
    return { stage };
  }
  if (params.get("stage") === "assets") {
    return { stage: normalizeLegacyAssetsStage(params) };
  }
  return { stage: "current" };
}

export function buildStudioNavigationPath(
  novelId: string,
  options: { stage: StudioStage },
): string {
  const params = new URLSearchParams({ stage: options.stage });
  return `/drama/studio/${encodeURIComponent(novelId)}?${params.toString()}`;
}

export function buildScene3dEditorPath(novelId: string, sceneId: string, stateId: string): string {
  const params = new URLSearchParams({ returnStage: "scenes" });
  return `/drama/studio/${encodeURIComponent(novelId)}/scenes/${encodeURIComponent(sceneId)}/states/${encodeURIComponent(stateId)}/3d?${params.toString()}`;
}

export function resolveStudioReturnPath(novelId: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const returnStage = params.get("returnStage");
  // 拍平前生成的 3D 编辑器地址带着 returnStage=assets&returnAssetTab=…，照旧映射。
  if (returnStage === "assets") {
    return buildStudioNavigationPath(novelId, {
      stage: normalizeLegacyAssetsStage(params),
    });
  }
  if (returnStage && (STUDIO_STAGES as readonly string[]).includes(returnStage)) {
    return buildStudioNavigationPath(novelId, { stage: returnStage as StudioStage });
  }
  return null;
}
