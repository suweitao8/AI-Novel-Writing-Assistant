import { SettingsShell } from "../components/SettingsShell";
import RecentErrorsCard from "../components/RecentErrorsCard";
import TaskCenterPage from "@/pages/tasks/TaskCenterPage";

/** 系统设置内的记录页签：任务运行历史与需要处理的记录。 */
export default function RecordsSettingsPage() {
  return (
    <SettingsShell
      title="运行记录"
      description="查看创作、拆书、知识索引和图片任务，优先处理需要你介入的记录。实时生成过程可从顶部「AI 实况」查看。"
    >
      <RecentErrorsCard />
      <TaskCenterPage />
    </SettingsShell>
  );
}
