import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, RotateCcw, Save } from "lucide-react";
import { getUniversalArtStyle, updateUniversalArtStyle } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { SettingsShell } from "../components/SettingsShell";

// 设置 · 通用画风：所有漫剧画面共用的渲染质感基线（UE5 级 3D 写实，不含时代/题材属性）。
// 题材与氛围由每本书「设定 · 美术风格」里的具体风格叠加，两层组合后用于生成。
// 留空保存即恢复内置默认。
export default function ArtStyleSettingsPage() {
  const queryClient = useQueryClient();
  const universalQuery = useQuery({
    queryKey: queryKeys.settings.universalArtStyle,
    queryFn: getUniversalArtStyle,
  });

  const [draft, setDraft] = useState("");
  const [customized, setCustomized] = useState(false);
  useEffect(() => {
    const data = universalQuery.data?.data;
    if (data) {
      setDraft(data.prompt || data.defaultPrompt);
      setCustomized(Boolean(data.prompt));
    }
  }, [universalQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: { prompt: string }) => updateUniversalArtStyle(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.universalArtStyle });
      const data = result.data;
      if (data) {
        setDraft(data.prompt || data.defaultPrompt);
        setCustomized(Boolean(data.prompt));
      }
      toast.success(result.message || "通用画风已保存。");
    },
    onError: (error: Error) => {
      toast.error("通用画风保存失败。", { description: error.message });
    },
  });

  const effective = customized ? draft : (universalQuery.data?.data?.defaultPrompt ?? "");

  return (
    <SettingsShell title="通用画风" description="所有画面共用的渲染质感基线；每本书的题材画风在小说设定·美术风格里选。">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            通用画风
          </CardTitle>
          <CardDescription>
            只写渲染质感（引擎、材质、光照、成片级别），题材（现代、末世、玄幻…）由每本书的画风叠加。留空保存即恢复默认。
            {customized ? "当前使用自定义内容。" : "当前使用默认内容。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {universalQuery.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在读取通用画风
            </div>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={7}
                maxLength={2000}
                spellCheck={false}
                aria-label="通用画风提示词"
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus-visible:border-primary"
                placeholder="描述所有画面共用的渲染质感（留空保存＝恢复默认）"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ prompt: draft.trim() })}>
                  {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                  保存
                </Button>
                <Button
                  size="sm" variant="outline" disabled={saveMutation.isPending || !customized}
                  onClick={() => saveMutation.mutate({ prompt: "" })}
                  title="清空自定义，回到内置默认"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  恢复默认
                </Button>
              </div>
              {customized ? null : (
                <p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
                  {effective}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
