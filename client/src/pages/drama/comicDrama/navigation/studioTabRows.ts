import type { PageTabRow } from "@/components/layout/PageTabsContext";
import {
  ASSET_TAB_LABELS,
  SETTINGS_TAB_LABELS,
  STUDIO_STAGE_LABELS,
  type AssetTab,
  type SettingsTab,
  type StudioStage,
} from "./studioNavigation";

function stageTabs(onSelect: (stage: StudioStage) => void): PageTabRow["tabs"] {
  return (Object.keys(STUDIO_STAGE_LABELS) as StudioStage[]).map((key) => ({
    key,
    label: STUDIO_STAGE_LABELS[key],
  }));
}

/** 二级页签（当前 / 资产 / 设定）：全工作室页面与深层的资产编辑器共用同一份。 */
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

/** 三级页签（资产：角色 / 场景 / 道具）：场景编辑器等深层页面在资产语境下显示这份。 */
export function buildStudioNavAssetSubRow(
  activeAssetTab: AssetTab,
  onSelectAssetTab: (tab: AssetTab) => void,
): PageTabRow {
  return {
    id: "studio-sub",
    tabs: (Object.keys(ASSET_TAB_LABELS) as AssetTab[]).map((key) => ({
      key,
      label: ASSET_TAB_LABELS[key],
    })),
    active: activeAssetTab,
    onSelect: (key) => onSelectAssetTab(key as AssetTab),
  };
}

/** 三级页签（设定：世界观 / 地图 / 通用），供需要在非工作室页展示设定子级时复用。 */
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
