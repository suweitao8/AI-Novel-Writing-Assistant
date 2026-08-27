// 章节工作台的子页签也已拍平（2026-08-27 用户决定）：参考 / 提取 / 脚本 / 分镜 /
// 视频直接作为二级页签，与角色、场景、道具、设定平级；「章节」与「资产」两个
// 中间层都不复存在。角色、场景、道具、参考、提取、脚本、分镜、视频始终工作在
// 「当前选中章节」的上下文里，章节切换仍由导航栏操作区的章节按钮承担。
export type StudioStage =
  | "characters"
  | "scenes"
  | "props"
  | "reference"
  | "extract"
  | "script"
  | "storyboard"
  | "video"
  | "settings";
export type SettingsTab = "world" | "map" | "general";

/** 二级页签顺序：角色、场景、道具、参考、提取、脚本、分镜、视频、设定。 */
export const STUDIO_STAGE_ORDER: readonly StudioStage[] = [
  "characters",
  "scenes",
  "props",
  "reference",
  "extract",
  "script",
  "storyboard",
  "video",
  "settings",
];

/** 项目级页签的显示文案；顶部导航栏二级/三级页签共用同一份。 */
export const STUDIO_STAGE_LABELS: Record<StudioStage, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
  reference: "参考",
  extract: "提取",
  script: "脚本",
  storyboard: "分镜",
  video: "视频",
  settings: "设定",
};

/** 章节工作台的五个页签（原「章节」子页签），共享章节上下文的操作按钮。 */
export const CHAPTER_WORKBENCH_STAGES: readonly StudioStage[] = [
  "reference",
  "extract",
  "script",
  "storyboard",
  "video",
];

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
 * 旧链接兼容（按引入顺序）：
 * - ?stage=assets&assetTab=scenes（资产拍平前）→ scenes 等；
 * - ?stage=current（章节拍平前）与缺省 → 脚本；
 * - ?stage=current&tab=storyboard（章节子页签深链）→ storyboard。
 */
function normalizeLegacyStage(params: URLSearchParams): StudioStage {
  const legacyTab = parseValue(
    params.get("tab"),
    CHAPTER_WORKBENCH_STAGES as readonly StudioStage[],
  );
  if (legacyTab) return legacyTab;
  if (params.get("stage") === "assets") {
    const assetTab = params.get("assetTab") ?? params.get("returnAssetTab");
    if (assetTab === "scenes") return "scenes";
    if (assetTab === "props") return "props";
    return "characters";
  }
  return "script";
}

export function readStudioNavigation(search: string): { stage: StudioStage } {
  const params = new URLSearchParams(search);
  const stage = parseValue(params.get("stage"), STUDIO_STAGES) ?? normalizeLegacyStage(params);
  return { stage };
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
  if (returnStage === "assets") {
    return buildStudioNavigationPath(novelId, { stage: normalizeLegacyStage(params) });
  }
  if (returnStage && (STUDIO_STAGES as readonly string[]).includes(returnStage)) {
    return buildStudioNavigationPath(novelId, { stage: returnStage as StudioStage });
  }
  return null;
}
