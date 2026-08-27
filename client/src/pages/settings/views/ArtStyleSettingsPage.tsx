import { SettingsShell } from "../components/SettingsShell";
import ArtStyleLibraryPage from "@/pages/artStyle/ArtStyleLibraryPage";

/** 系统设置内的画风页签：资产画风与时代画风的集中管理。 */
export default function ArtStyleSettingsPage() {
  return (
    <SettingsShell
      title="画风管理"
      description="通用美术风格：写实影视化。资产画风与时代画风，全部小说和漫剧项目共用。"
    >
      <ArtStyleLibraryPage />
    </SettingsShell>
  );
}
