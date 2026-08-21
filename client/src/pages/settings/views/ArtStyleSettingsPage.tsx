import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, RotateCcw, Save } from "lucide-react";
import type { DramaAssetArtStyleSetting, DramaAssetStyleKind } from "@/api/settings";
import { getDramaAssetArtStyles, updateDramaAssetArtStyle } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { SettingsShell } from "../components/SettingsShell";

const STYLE_KIND_ORDER: DramaAssetStyleKind[] = ["character", "scene", "prop"];

function AssetStyleCard(props: { setting: DramaAssetArtStyleSetting }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(props.setting.prompt);

  useEffect(() => {
    setDraft(props.setting.prompt);
  }, [props.setting.kind, props.setting.prompt]);

  const mutation = useMutation({
    mutationFn: (prompt: string) => updateDramaAssetArtStyle(props.setting.kind, { prompt }),
    onSuccess: async (result) => {
      const next = result.data?.setting;
      if (next) {
        setDraft(next.prompt);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dramaAssetArtStyles });
      toast.success(result.message || `${props.setting.label}已保存。`);
    },
    onError: (error: Error) => {
      toast.error(`${props.setting.label}保存失败。`, { description: error.message });
    },
  });

  const save = () => mutation.mutate(draft.trim());
  const restore = () => mutation.mutate("");

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
          {props.setting.label}
        </CardTitle>
        <CardDescription>{props.setting.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs font-medium text-foreground">固定规格</div>
          <p className="text-xs leading-5 text-muted-foreground">{props.setting.formatInstructions}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">正向画风</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            maxLength={2000}
            spellCheck={false}
            aria-label={`${props.setting.label}正向画风提示词`}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus-visible:border-primary"
            placeholder="补充这一类资产希望呈现的材质、光照和成片质感"
          />
          <span className="block text-right text-xs text-muted-foreground" aria-live="polite">
            {draft.length}/2000
          </span>
        </label>

        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs font-medium text-foreground">固定约束</div>
          <p className="text-xs leading-5 text-muted-foreground">{props.setting.fixedAvoidInstructions}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={mutation.isPending} onClick={save}>
            {mutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending || !props.setting.customized}
            onClick={restore}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            恢复默认
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {props.setting.customized ? "当前使用自定义内容" : "当前使用默认内容"}
          </span>
        </div>
        {mutation.isError ? (
          <p className="text-xs text-destructive" role="alert">
            {mutation.error instanceof Error ? mutation.error.message : "保存失败，请重试。"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ArtStyleSettingsPage() {
  const stylesQuery = useQuery({
    queryKey: queryKeys.settings.dramaAssetArtStyles,
    queryFn: getDramaAssetArtStyles,
  });
  const styles = stylesQuery.data?.data?.styles ?? [];
  const orderedStyles = STYLE_KIND_ORDER
    .map((kind) => styles.find((style) => style.kind === kind))
    .filter((style): style is DramaAssetArtStyleSetting => Boolean(style));

  return (
    <SettingsShell title="画风管理" description="分别管理角色、场景和道具资产的画风。">
      {stylesQuery.isPending ? (
        <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在读取画风设置
        </div>
      ) : stylesQuery.isError ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm text-destructive">画风设置读取失败，请重试。</p>
          <Button variant="outline" size="sm" onClick={() => stylesQuery.refetch()} disabled={stylesQuery.isFetching}>
            {stylesQuery.isFetching ? "读取中…" : "重试"}
          </Button>
        </div>
      ) : orderedStyles.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground" role="status">
          暂无画风设置
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {orderedStyles.map((setting) => (
            <AssetStyleCard key={setting.kind} setting={setting} />
          ))}
        </div>
      )}
    </SettingsShell>
  );
}
