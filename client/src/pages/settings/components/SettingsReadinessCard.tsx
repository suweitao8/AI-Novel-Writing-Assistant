import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, Loader2 } from "lucide-react";
import type {
  ModelCategoriesStatus,
  RagSettingsStatus,
  StyleEngineRuntimeSettingsStatus,
} from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export type SettingsReadinessItem = {
  key: "text" | "image" | "rag" | "style";
  title: string;
  description: string;
  state: "ready" | "warning" | "optional" | "checking";
};

function getReadinessIcon(state: SettingsReadinessItem["state"]) {
  if (state === "ready") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />;
  }
  if (state === "checking") {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-300" />;
  }
  if (state === "optional") {
    return <CircleDashed className="h-4 w-4 text-sky-600 dark:text-sky-300" />;
  }
  return <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" />;
}

function getReadinessBadge(state: SettingsReadinessItem["state"]) {
  switch (state) {
    case "ready":
      return "可用";
    case "checking":
      return "检查中";
    case "optional":
      return "可选增强";
    case "warning":
      return "需要处理";
  }
}

export function buildSettingsReadinessItems(input: {
  categories?: ModelCategoriesStatus | null;
  ragSettings?: RagSettingsStatus | null;
  styleSettings?: StyleEngineRuntimeSettingsStatus | null;
  isStyleSettingsLoaded: boolean;
}): SettingsReadinessItem[] {
  const { categories, ragSettings, styleSettings, isStyleSettingsLoaded } = input;
  const textReady = Boolean(categories?.text?.isConfigured && categories.text.currentModel);
  const imageReady = Boolean(categories?.image?.isConfigured && categories.image.currentModel);
  const currentRagProvider = ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider);
  const styleTimeout = styleSettings?.styleExtractionTimeoutMs;
  const styleReady = Boolean(styleSettings)
    && typeof styleTimeout === "number"
    && styleTimeout >= styleSettings!.minStyleExtractionTimeoutMs
    && styleTimeout <= styleSettings!.maxStyleExtractionTimeoutMs;

  return [
    {
      key: "text",
      title: "文本模型",
      state: textReady ? "ready" : "warning",
      description: textReady
        ? `文本模型已就绪（${categories!.text.currentModel}），大纲、正文、审校等任务都可以使用。`
        : "先在模型设置中配置文本模型，就可以开始开书和生成章节。",
    },
    {
      key: "image",
      title: "图片模型",
      state: imageReady ? "ready" : "optional",
      description: imageReady
        ? `图片模型已就绪（${categories!.image.currentModel}），可以生成封面和插图。`
        : "暂未配置图片模型；需要生成封面或插图时再配置即可。",
    },
    {
      key: "rag",
      title: "知识库增强",
      state: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive ? "ready" : "optional",
      description: ragSettings?.enabled && currentRagProvider?.isConfigured && currentRagProvider?.isActive
        ? "知识库检索已启用，可帮助长篇写作保持资料和设定连续。"
        : "不配置也可以开始创作；启用后会增强设定、资料和上下文召回。",
    },
    {
      key: "style",
      title: "写法引擎",
      state: !isStyleSettingsLoaded ? "checking" : styleReady ? "ready" : "warning",
      description: styleReady
        ? "写法提取等待时间在可用范围内，可用于学习样本文风。"
        : "请确认写法提取等待时间在可用范围内。",
    },
  ];
}

export default function SettingsReadinessCard(props: {
  items: SettingsReadinessItem[];
}) {
  const { items } = props;
  const textItem = items.find((item) => item.key === "text");
  const hasTextModel = textItem?.state === "ready";
  const blockingCount = items.filter((item) => item.key !== "rag" && item.key !== "image" && item.state === "warning").length;
  const canStart = hasTextModel && blockingCount === 0;
  const primaryAction = !hasTextModel
    ? { label: "配置文本模型", to: "/settings/models" }
    : { label: "开始创建小说", to: "/novels/create" };

  return (
    <Card className="min-w-0 overflow-hidden border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>创作可用性检查</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            先确认开始写小说必需的文本模型是否可用；图片和知识库属于增强项，可以稍后再补。
          </CardDescription>
        </div>
        <Button asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
          <Link to={primaryAction.to}>
            {primaryAction.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.key} className="min-w-0 rounded-md border bg-background/80 p-3">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {getReadinessIcon(item.state)}
                  <div className="min-w-0 font-medium">{item.title}</div>
                </div>
                <Badge variant={item.state === "ready" ? "default" : "outline"}>
                  {getReadinessBadge(item.state)}
                </Badge>
              </div>
              <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {item.description}
              </div>
            </div>
          ))}
        </div>
        <div className={`text-sm ${canStart ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"} ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          {canStart
            ? "基础创作链路已经可用，可以开始创建或继续推进小说。"
            : "先处理标记为“需要处理”的项目，完成后再进入自动导演或章节生产会更稳。"}
        </div>
      </CardContent>
    </Card>
  );
}
