import { SettingsShell } from "../components/SettingsShell";
import ModelCategorySettings from "../models/ModelCategorySettings";

export default function ModelsSettingsPage() {
  return (
    <SettingsShell title="模型设置" description="按文本、图片、音频三类能力配置模型，全部创作任务自动使用对应模型。">
      <ModelCategorySettings />
    </SettingsShell>
  );
}
