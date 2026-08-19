import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDramaEpisodeBatchJob,
  createDramaVideoProviderTask,
  downloadDramaExport,
  generateDramaEpisodeScript,
  generateDramaOutline,
  generateDramaShotKeyframe,
  generateDramaStoryboard,
  generateDramaStrategy,
  generateDramaVideoPrompt,
  getDramaProject,
  listDramaVideoProviders,
  refreshDramaVideoProviderTask,
  repairDramaEpisode,
  reviewDramaEpisode,
  type DramaProjectDetail,
  type DramaShot,
  type DramaShotBatchJobType,
  type DramaVideoPrompt,
} from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import type { ImageGenerationOverrides } from "@/api/media/comic";
import { DramaNextStepPanel } from "@/pages/drama/components/DramaNextStepPanel";
import { DramaVisualPanel } from "@/pages/drama/components/DramaVisualPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// 与工作台一致的活跃任务判定：有批量任务/视频任务/首帧生成中时轮询项目详情。
function hasActiveDramaVisualWork(project: DramaProjectDetail | undefined): boolean {
  if (!project) {
    return false;
  }
  if ((project.batchJobs ?? []).some((job) => job.status === "pending" || job.status === "running")) {
    return true;
  }
  if ((project.videoPrompts ?? []).some((prompt) => prompt.status === "queued" || prompt.status === "running")) {
    return true;
  }
  return (project.episodes ?? []).some((episode) =>
    (episode.storyboards ?? []).some((board) =>
      (board.shots ?? []).some((shot) => {
        try {
          const keyframe = shot.keyframeData ? (JSON.parse(shot.keyframeData) as { status?: string }) : null;
          return keyframe?.status === "generating";
        } catch {
          return false;
        }
      }),
    ),
  );
}

// 漫剧工作室「当前 · 分镜」页签的内嵌分镜面板：制作下一步引导 + 分镜板/首帧/视频任务
// 全部就地展示与操作，不再跳转到独立工作台。深水区（来源素材/策略/分集台本/质量/角色/导出）
// 仍可在小说侧工作台处理；这里覆盖分镜相关的完整链路。
export default function StoryboardStagePanel(props: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [selectedVideoProvider, setSelectedVideoProvider] = useState("mock");

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(props.projectId),
    queryFn: () => getDramaProject(props.projectId),
    refetchInterval: (query) => (hasActiveDramaVisualWork(query.state.data?.data) ? 4000 : false),
  });
  const videoProvidersQuery = useQuery({
    queryKey: queryKeys.drama.videoProviders,
    queryFn: listDramaVideoProviders,
  });

  const project = projectQuery.data?.data;
  const videoProviders = videoProvidersQuery.data?.data ?? [];
  const activeVideoProvider = videoProviders.some((provider) => provider.provider === selectedVideoProvider)
    ? selectedVideoProvider
    : videoProviders[0]?.provider ?? "mock";

  const invalidateProject = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(props.projectId) });
  };

  const actionMutation = useMutation({
    mutationFn: async (input: { action: () => Promise<unknown>; message: string }) => {
      await input.action();
      return input.message;
    },
    onSuccess: async (message) => {
      await invalidateProject();
      toast.success(message);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "操作失败，请重试。"),
  });

  const runAction = (action: () => Promise<unknown>, message: string) => {
    return actionMutation.mutateAsync({ action, message });
  };

  if (projectQuery.isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
        正在加载分镜项目…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center text-sm text-muted-foreground">
        没有找到分镜项目。
      </div>
    );
  }

  const handleExportMarkdown = async () => {
    const blob = await downloadDramaExport(project.id, "markdown");
    downloadBlob(blob, `${project.title}-storyboard.md`);
  };

  return (
    <div className="space-y-4">
      <DramaNextStepPanel
        project={project}
        busy={actionMutation.isPending}
        onSetTab={() => undefined}
        onSelectEpisode={setSelectedOrder}
        onAssembleSource={() => runAction(async () => undefined, "来源素材已在每次切换章节时自动同步。")}
        onGenerateStrategy={() => runAction(() => generateDramaStrategy(project.id), "短剧策略已生成。")}
        onGenerateOutline={() => runAction(() => generateDramaOutline(project.id), "分集大纲已生成。")}
        onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
        onReviewEpisode={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
        onRepairEpisode={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        onGenerateStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
        onGenerateVideoPrompt={(shot: DramaShot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
        onCreateProviderTask={(prompt: DramaVideoPrompt) => runAction(() => createDramaVideoProviderTask(prompt.id, activeVideoProvider), "视频任务已创建。")}
        onExportMarkdown={() => void handleExportMarkdown()}
      />

      {(project.episodes ?? []).length > 0 ? (
        <DramaVisualPanel
          project={project}
          selectedOrder={selectedOrder ?? project.episodes?.[0]?.order ?? null}
          onSelectOrder={setSelectedOrder}
          busy={actionMutation.isPending}
          onStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
          onBatchJob={(order, input: { type: DramaShotBatchJobType; provider?: string; shotIds?: string[]; failedShotIds?: string[]; useCharacterRefImages?: boolean }) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), "批量任务已创建。")}
          onKeyframe={(shot: DramaShot, provider?: string, useCharacterRefImages?: boolean, overrides?: ImageGenerationOverrides) => runAction(() => generateDramaShotKeyframe(project.id, shot.id, provider, useCharacterRefImages, overrides), `镜头 ${shot.order} 的首帧图已生成。`)}
          onVideoPrompt={(shot: DramaShot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
          videoProviders={videoProviders}
          selectedProvider={activeVideoProvider}
          onSelectProvider={setSelectedVideoProvider}
          onProviderTask={(prompt: DramaVideoPrompt, provider: string) => runAction(() => createDramaVideoProviderTask(prompt.id, provider), "视频任务已创建。")}
          onRefreshProviderTask={(prompt: DramaVideoPrompt) => runAction(() => refreshDramaVideoProviderTask(prompt.id), "视频任务状态已刷新。")}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-8 text-center text-sm leading-6 text-muted-foreground">
          还没有分集。按上面的「下一步」生成策略与分集后，这里会出现每一集的分镜板。
          <div className="mt-3">
            <Button
              size="sm"
              disabled={actionMutation.isPending}
              onClick={() => runAction(() => generateDramaOutline(project.id), "分集大纲已生成。")}
            >
              生成分集
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
