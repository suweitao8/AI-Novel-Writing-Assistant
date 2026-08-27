import type { PageTabRow } from "@/components/layout/PageTabsContext";
import {
  SETTINGS_TAB_LABELS,
  STUDIO_STAGE_LABELS,
  type SettingsTab,
  type StudioStage,
} from "./studioNavigation";

function stageTabs(onSelect: (stage: StudioStage) => void): PageTabRow["tabs"] {
  return ([
    "characters",
    "scenes",
    "props",
    "reference",
    "extract",
    "script",
    "storyboard",
    "video",
    "settings",
  ] as const).map((key) => ({
    key,
    label: STUDIO_STAGE_LABELS[key],
  }));
}

/**
 * 二级页签（角色 / 场景 / 道具 / 参考 / 提取 / 脚本 / 分镜 / 视频 / 设定）：
 * 全工作室页面与深层的场景编辑器共用同一份。资产与章节两个中间层都已拍平。
 */
export function buildStudioNavStageRow(
  activeStage: StudioStage,
  onSelectStage: (stage: StudioStage) => void,
): PageTabRow {
  return {
    id: "studio-stage",
    tabs: stageTabs(onSelectStage),
    active: activeStage,
    onSelect: (key) => onSelectStage(key as StudioStage),
  };
}

/** 三级页签（设定：世界观 / 地图 / 通用）。 */
export function buildStudioNavSettingsSubRow(
  activeSettingsTab: SettingsTab,
  onSelectSettingsTab: (tab: SettingsTab) => void,
): PageTabRow {
  return {
    id: "studio-sub",
    tabs: (Object.keys(SETTINGS_TAB_LABELS) as SettingsTab[]).map((key) => ({
      key,
      label: SETTINGS_TAB_LABELS[key],
    })),
    active: activeSettingsTab,
    onSelect: (key) => onSelectSettingsTab(key as SettingsTab),
  };
}
