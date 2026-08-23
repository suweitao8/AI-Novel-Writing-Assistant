import {
  CheckCircle2,
  Download,
  Film,
  Layers3,
  ListVideo,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { DramaEpisode, DramaProjectDetail } from "@/api/media/drama";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type NextStepKind =
  | "source"
  | "strategy"
  | "outline"
  | "script"
  | "review"
  | "repair"
  | "storyboard"
  | "assembly"
  | "export";

interface NextStep {
  kind: NextStepKind;
  title: string;
  description: string;
  button: string;
  tab: "source" | "strategy" | "episodes" | "visual" | "export";
  icon: "source" | "strategy" | "outline" | "script" | "review" | "repair" | "storyboard" | "assembly" | "export";
  episodeOrder?: number;
}

function firstEpisodeWithoutScript(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => !episode.content?.trim());
}

function firstEpisodeWithoutReview(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) =>
    Boolean(episode.content?.trim()) && !["reviewed", "needs_repair", "approved"].includes(episode.status)
  );
}

function firstRepairableEpisode(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => episode.status === "needs_repair");
}

function firstEpisodeWithoutStoryboard(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => Boolean(episode.content?.trim()) && (episode.storyboards?.length ?? 0) === 0);
}

function firstEpisodeWithStoryboard(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => (episode.storyboards?.length ?? 0) > 0);
}

function buildNextStep(project: DramaProjectDetail): NextStep {
  const episodes = project.episodes ?? [];
  const repairable = firstRepairableEpisode(episodes);
  const unreviewed = firstEpisodeWithoutReview(episodes);
  const unscripted = firstEpisodeWithoutScript(episodes);
  const unstagedStoryboard = firstEpisodeWithoutStoryboard(episodes);
  const firstAssembledEpisode = firstEpisodeWithStoryboard(episodes);

  if (!project.sourceBundle) {
    return {
      kind: "source",
      title: "下一步：整理来源素材",
      description: "把小说、灵感或导入文本整理成短剧可用的梗概、节拍、角色和硬事实。",
      button: "整理素材",
      tab: "source",
      icon: "source",
    };
  }
  if (!project.strategy) {
    return {
      kind: "strategy",
      title: "下一步：生成短剧策略",
      description: "根据素材和赛道生成受众定位、主爽点线、付费卡点和改编边界。",
      button: "生成策略",
      tab: "strategy",
      icon: "strategy",
    };
  }
  if (episodes.length === 0) {
    return {
      kind: "outline",
      title: "下一步：生成前 12 集分集",
      description: "生成一段可检查的分集大纲，确认钩子、冲突和付费卡点方向。",
      button: "生成前 12 集",
      tab: "episodes",
      icon: "outline",
    };
  }
  if (unscripted) {
    return {
      kind: "script",
      title: `下一步：生成第 ${unscripted.order} 集台本`,
      description: "把本集大纲写成可拍摄、对白密集、开场有钩子、结尾有卡点的短剧台本。",
      button: "生成台本",
      tab: "episodes",
      icon: "script",
      episodeOrder: unscripted.order,
    };
  }
  if (repairable) {
    return {
      kind: "repair",
      title: `下一步：修复第 ${repairable.order} 集质量问题`,
      description: "按已有质量建议修复，保证分镜画面与配音素材稳定。",
      button: "修复台本",
      tab: "episodes",
      icon: "repair",
      episodeOrder: repairable.order,
    };
  }
  if (unreviewed) {
    return {
      kind: "review",
      title: `下一步：检查第 ${unreviewed.order} 集质量`,
      description: "检查黄金 3 秒、信息密度、付费卡点、时长、事实一致和角色一致。",
      button: "质量检查",
      tab: "episodes",
      icon: "review",
      episodeOrder: unreviewed.order,
    };
  }
  if (unstagedStoryboard) {
    return {
      kind: "storyboard",
      title: `下一步：生成第 ${unstagedStoryboard.order} 集分镜`,
      description: "把已通过检查的台本拆成可拍摄镜头，保留角色视觉锚点和动作重点。",
      button: "生成分镜",
      tab: "visual",
      icon: "storyboard",
      episodeOrder: unstagedStoryboard.order,
    };
  }
  if (firstAssembledEpisode) {
    return {
      kind: "assembly",
      title: `下一步：制作第 ${firstAssembledEpisode.order} 集成片`,
      description: "进入成片工作台，生成静态分镜画面、配音和字幕。",
      button: "打开成片工作台",
      tab: "visual",
      icon: "assembly",
      episodeOrder: firstAssembledEpisode.order,
    };
  }
  return {
    kind: "export",
    title: "下一步：导出短剧资料",
    description: "导出当前角色、分集、台本、质量结果和后续生产资料，方便继续编辑或交付。",
    button: "导出 Markdown",
    tab: "export",
    icon: "export",
  };
}

function StepIcon({ icon }: { icon: NextStep["icon"] }) {
  const className = "h-4 w-4";
  if (icon === "source") return <Layers3 className={className} />;
  if (icon === "strategy") return <Sparkles className={className} />;
  if (icon === "outline") return <ListVideo className={className} />;
  if (icon === "script") return <Wand2 className={className} />;
  if (icon === "review") return <CheckCircle2 className={className} />;
  if (icon === "repair") return <RefreshCw className={className} />;
  if (icon === "storyboard") return <Film className={className} />;
  if (icon === "assembly") return <Film className={className} />;
  return <Download className={className} />;
}

export function DramaNextStepPanel(props: {
  project: DramaProjectDetail;
  busy: boolean;
  onSetTab: (tab: NextStep["tab"]) => void;
  onSelectEpisode: (order: number) => void;
  onAssembleSource: () => void;
  onGenerateStrategy: () => void;
  onGenerateOutline: () => void;
  onGenerateScript: (order: number) => void;
  onReviewEpisode: (order: number) => void;
  onRepairEpisode: (order: number) => void;
  onGenerateStoryboard: (order: number) => void;
  onExportMarkdown: () => void;
}) {
  const step = buildNextStep(props.project);
  const runStep = () => {
    props.onSetTab(step.tab);
    if (step.episodeOrder) {
      props.onSelectEpisode(step.episodeOrder);
    }
    if (step.kind === "source") props.onAssembleSource();
    if (step.kind === "strategy") props.onGenerateStrategy();
    if (step.kind === "outline") props.onGenerateOutline();
    if (step.kind === "script" && step.episodeOrder) props.onGenerateScript(step.episodeOrder);
    if (step.kind === "review" && step.episodeOrder) props.onReviewEpisode(step.episodeOrder);
    if (step.kind === "repair" && step.episodeOrder) props.onRepairEpisode(step.episodeOrder);
    if (step.kind === "storyboard" && step.episodeOrder) props.onGenerateStoryboard(step.episodeOrder);
    if (step.kind === "export") props.onExportMarkdown();
  };

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{step.title}</CardTitle>
            <Badge variant="outline">{props.project.targetEpisodes} 集项目</Badge>
          </div>
          <CardDescription>{step.description}</CardDescription>
        </div>
        <Button type="button" disabled={props.busy} onClick={runStep}>
          <StepIcon icon={step.icon} />
          {props.busy ? "处理中..." : step.button}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>已整理素材：{props.project.sourceBundle ? "是" : "否"}</span>
        <span>策略：{props.project.strategy ? "已生成" : "未生成"}</span>
        <span>分集：{props.project.episodes?.length ?? 0} 集</span>
        <span>已准备分镜：{props.project.episodes?.filter((episode) => (episode.storyboards?.length ?? 0) > 0).length ?? 0}/{props.project.episodes?.length ?? 0} 集</span>
      </CardContent>
    </Card>
  );
}
