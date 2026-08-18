import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenCheck, Bot, Database, MonitorCog } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getModelCategories,
  getRagSettings,
  getStyleEngineRuntimeSettings,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SettingsReadinessCard, { buildSettingsReadinessItems } from "../components/SettingsReadinessCard";
import { SettingsShell } from "../components/SettingsShell";
import { APP_RUNTIME } from "@/lib/constants";

const entries = [
  { to: "/settings/models", title: "模型设置", description: "配置文本模型与图片模型，并检查连接状态。", icon: Bot },
  { to: "/settings/director", title: "自动导演", description: "安排问题处理、确认偏好与提醒方式。", icon: BookOpenCheck },
  { to: "/settings/knowledge", title: "知识库与写法", description: "让资料和写法偏好参与后续创作。", icon: Database },
  { to: "/settings/maintenance", title: "桌面与维护", description: "查看适用于当前设备的更新和数据维护。", icon: MonitorCog },
];

export default function SettingsOverviewPage() {
  const categoriesQuery = useQuery({ queryKey: queryKeys.settings.modelCategories, queryFn: getModelCategories });
  const ragQuery = useQuery({ queryKey: queryKeys.settings.rag, queryFn: getRagSettings });
  const styleQuery = useQuery({ queryKey: queryKeys.settings.styleEngineRuntime, queryFn: getStyleEngineRuntimeSettings });
  const items = useMemo(() => buildSettingsReadinessItems({
    categories: categoriesQuery.data?.data,
    ragSettings: ragQuery.data?.data,
    styleSettings: styleQuery.data?.data,
    isStyleSettingsLoaded: styleQuery.isSuccess,
  }), [categoriesQuery.data?.data, ragQuery.data?.data, styleQuery.data?.data, styleQuery.isSuccess]);
  const categories = categoriesQuery.data?.data;
  const textReady = Boolean(categories?.text?.isConfigured && categories.text.currentModel);
  const rag = ragQuery.data?.data;

  return (
    <SettingsShell title="系统设置" description="查看创作环境状态，并进入需要调整的设置。">
      <SettingsReadinessCard items={items} />
      <div className="grid gap-4 md:grid-cols-2">
        {entries.map(({ to, title, description, icon: Icon }) => {
          const summary = title === "模型设置"
            ? textReady
              ? `文本 ${categories!.text.currentModel}${categories!.image?.isConfigured && categories!.image.currentImageModel ? ` · 图片 ${categories!.image.currentImageModel}` : ""}`
              : "尚未配置可用的文本模型"
            : title === "知识库与写法"
              ? rag?.enabled ? `资料检索已开启 · ${rag.embeddingModel || "未选择向量模型"}` : "可选增强，暂不影响开始创作"
              : title === "桌面与维护"
                ? APP_RUNTIME === "desktop" ? "可检查桌面更新和本机旧数据" : "网页端无需桌面维护"
                : "设置确认偏好、问题处理和通知方式";
          return (
            <Card key={to} className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">{summary}</p>
                <Button asChild variant="outline" size="sm" className="shrink-0"><Link to={to}>打开<ArrowRight className="h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </SettingsShell>
  );
}
