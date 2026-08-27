import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Palette, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { DramaAssetArtStyleSetting, DramaAssetStyleKind } from "@/api/settings";
import { getDramaAssetArtStyles, updateDramaAssetArtStyle } from "@/api/settings";
import type { DramaEraStyleCustom, DramaVisualStyle } from "@/api/media/drama";
import { getDramaEraStyles, getDramaVisualStyles, saveDramaEraStyles } from "@/api/media/drama";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

// 画风管理（独立页，2026-08-22 用户要求从系统设置里拆出来）：资产画风（角色/场景/道具）
// 与时代画风（内置预设 + 全局自定义）集中在一处维护，全部小说与漫剧项目共用；
// 项目侧只引用名字——脚本页签顶部切换时代风格、外观状态按状态选择。

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

interface EraStyleDraft {
  label: string;
  prompt: string;
}

function EraStyleSection(props: { presets: DramaVisualStyle[] }) {
  const queryClient = useQueryClient();
  const [library, setLibrary] = useState<EraStyleDraft[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const customsQuery = useQuery({
    queryKey: queryKeys.drama.eraStyles,
    queryFn: getDramaEraStyles,
  });
  const customs = customsQuery.data?.data?.styles ?? [];

  useEffect(() => {
    if (!customsQuery.data || hydrated) {
      return;
    }
    setHydrated(true);
    setLibrary(customs.map((style) => ({ label: style.label, prompt: style.prompt })));
  }, [hydrated, customsQuery.data, customs]);

  const presetNames = new Set(props.presets.flatMap((style) => [style.id, style.label]));
  const labels = library.map((style) => style.label.trim());
  const duplicated = labels.some((label, index) => !label || labels.indexOf(label) !== index);
  const collidesBuiltin = labels.some((label) => presetNames.has(label));

  const invalidate = async () => {
    setHydrated(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.eraStyles });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.visualStyles });
  };

  const libraryMutation = useMutation({
    mutationFn: () =>
      saveDramaEraStyles(
        library
          .map((style) => ({ label: style.label.trim(), prompt: style.prompt.trim() }))
          .filter((style) => style.label && style.prompt),
      ),
    onSuccess: async () => {
      await invalidate();
      toast.success("自定义时代画风已保存。");
    },
    onError: (error) => {
      toast.error("保存自定义时代画风失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const updateEntry = (index: number, patch: Partial<EraStyleDraft>) => {
    setLibrary((prev) => prev.map((style, i) => (i === index ? { ...style, ...patch } : style)));
  };

  const removeEntry = (index: number) => {
    const entry = library[index];
    if (entry && entry.label && !window.confirm(`删除画风「${entry.label}」？`)) {
      return;
    }
    setLibrary((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
          时代画风
        </CardTitle>
        <CardDescription>全部小说与漫剧项目共用；在「脚本」页签顶部切换，或给外观状态单独选择。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">内置时代画风</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {props.presets.map((preset) => (
              <div key={preset.id} className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-sm font-medium text-foreground">{preset.label}</div>
                <p className="text-xs leading-5 text-muted-foreground">{preset.summary}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">自定义时代画风</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLibrary((prev) => [...prev, { label: "", prompt: "" }])}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                添加
              </Button>
              <Button
                size="sm"
                onClick={() => libraryMutation.mutate()}
                disabled={libraryMutation.isPending || duplicated || collidesBuiltin || (hydrated && library.length === 0 && customs.length === 0)}
              >
                {libraryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {libraryMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
          {library.map((style, index) => (
            <div key={index} className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={style.label}
                  placeholder="风格名，例如：末世爆发后"
                  className="h-8 max-w-[240px]"
                  maxLength={20}
                  onChange={(event) => updateEntry(index, { label: event.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="删除画风"
                  onClick={() => removeEntry(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <textarea
                rows={2}
                className="min-h-[56px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="描述这个画风的质感、光线、色彩与材质，例如：现代都市但色调诡异压抑，雾气浓重，强对比光影。"
                maxLength={500}
                value={style.prompt}
                onChange={(event) => updateEntry(index, { prompt: event.target.value })}
              />
            </div>
          ))}
          {duplicated ? (
            <p className="text-xs text-destructive">每个画风都要有名字，且不能重名。</p>
          ) : null}
          {collidesBuiltin ? (
            <p className="text-xs text-destructive">自定义画风不能与内置时代画风重名。</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArtStyleLibraryPage() {
  const stylesQuery = useQuery({
    queryKey: queryKeys.settings.dramaAssetArtStyles,
    queryFn: getDramaAssetArtStyles,
  });
  const visualStylesQuery = useQuery({
    queryKey: queryKeys.drama.visualStyles,
    queryFn: getDramaVisualStyles,
  });

  const styles = stylesQuery.data?.data?.styles ?? [];
  const orderedStyles = STYLE_KIND_ORDER
    .map((kind) => styles.find((style) => style.kind === kind))
    .filter((style): style is DramaAssetArtStyleSetting => Boolean(style));
  const presets = (visualStylesQuery.data?.data ?? []).filter((style) => style.styleFamily !== "custom");

  return (
    <>
      {/* 页面标题与容器由系统设置的 SettingsShell 提供；本组件只渲染画风内容本身。 */}
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
      ) : (
        <section className="space-y-3" aria-label="资产画风">
          <h2 className="text-base font-semibold text-foreground">资产画风</h2>
          <div className="grid gap-4 xl:grid-cols-3">
            {orderedStyles.map((setting) => (
              <AssetStyleCard key={setting.kind} setting={setting} />
            ))}
          </div>
        </section>
      )}

      <EraStyleSection presets={presets} />
    </>
  );
}
