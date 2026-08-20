import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { DramaVisualStyle } from "@/api/media/drama";
import { getStorySettingsWorld, updateStorySettingsWorld } from "@/api/story/storySettings";
import { getUniversalArtStyle } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

// 「设定 · 美术风格」工作面：通用画风（系统级渲染质感，一行摘要 + 到设置页修改）
// + 时代风格（题材/氛围——内置预设与本书自定义合成一个点选列表，选中即默认时代风格），
// 两层组合后用于立绘/首帧图/视频生成。章节脚本里可随时【画风：名】切换（切换后后面
// 都用新的、新章节沿用最近一次），脚本标记优先于这里选的默认值（解析链见 dramaArtStyleResolver）。
interface ArtStylePanelProps {
  novelId: string;
  /** 内置风格预设（GET /drama/visual-styles），第一项是内置默认风格。 */
  styleOptions: DramaVisualStyle[];
  /** 已创建分镜项目时，画风变化会同步推送给分镜项目。 */
  onApplyProjectStyle: (styleId: string) => void;
  onChanged?: () => void | Promise<void>;
}

interface ArtStyleDraft {
  label: string;
  prompt: string;
  /** 进入编辑时的名字：用于识别「改名」并让时代风格跟着改名走。 */
  initialLabel: string;
}

export default function ArtStylePanel(props: ArtStylePanelProps) {
  const queryClient = useQueryClient();
  const [library, setLibrary] = useState<ArtStyleDraft[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(props.novelId),
    queryFn: () => getStorySettingsWorld(props.novelId),
  });
  const universalQuery = useQuery({
    queryKey: queryKeys.settings.universalArtStyle,
    queryFn: getUniversalArtStyle,
  });
  const universal = universalQuery.data?.data;
  const world = worldQuery.data?.data;
  const savedCustoms = world?.artStyles ?? [];
  const builtinDefaultId = props.styleOptions[0]?.id ?? null;
  const defaultStyleId = world?.defaultArtStyle ?? builtinDefaultId;

  useEffect(() => {
    if (!world || hydrated) {
      return;
    }
    setHydrated(true);
    setLibrary(savedCustoms.map((style) => ({ label: style.label, prompt: style.prompt, initialLabel: style.label })));
  }, [hydrated, world, savedCustoms]);

  const invalidate = async () => {
    setHydrated(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(props.novelId) });
    await props.onChanged?.();
  };

  const defaultMutation = useMutation({
    mutationFn: (styleId: string) => updateStorySettingsWorld(props.novelId, { defaultArtStyle: styleId }),
    onSuccess: async () => {
      props.onApplyProjectStyle(defaultMutation.variables ?? "");
      await invalidate();
      toast.success("时代风格已保存，之后生成的画面与视频都用它。");
    },
    onError: (error) => {
      toast.error("保存画风失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const labels = library.map((style) => style.label.trim());
  const labelInvalid = labels.some((label, index) => !label || labels.indexOf(label) !== index);

  const libraryMutation = useMutation({
    mutationFn: () => {
      const artStyles = library
        .map((style) => ({ label: style.label.trim(), prompt: style.prompt.trim() }))
        .filter((style) => style.label);
      // 时代风格指向的自定义风格被改名时，引用跟着新名字走；
      // 被删除时由服务端回落到内置默认，不需要在这里猜。
      const savedDefault = world?.defaultArtStyle ?? null;
      const renamed = savedDefault
        ? library.find((style) => style.initialLabel === savedDefault && style.label.trim() && style.label.trim() !== savedDefault)
        : undefined;
      return updateStorySettingsWorld(props.novelId, {
        artStyles,
        ...(renamed ? { defaultArtStyle: renamed.label.trim() } : {}),
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("自定义时代风格已保存。");
    },
    onError: (error) => {
      toast.error("保存自定义时代风格失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const updateEntry = (index: number, patch: Partial<Pick<ArtStyleDraft, "label" | "prompt">>) => {
    setLibrary((prev) => prev.map((style, i) => (i === index ? { ...style, ...patch } : style)));
  };

  const removeEntry = (index: number) => {
    const entry = library[index];
    if (entry && entry.initialLabel && !window.confirm(`删除画风「${entry.initialLabel}」？`)) {
      return;
    }
    setLibrary((prev) => prev.filter((_, i) => i !== index));
  };

  const customChips = savedCustoms.map((style) => ({ id: style.label, label: style.label, summary: style.prompt }));
  const allChips = [...props.styleOptions, ...customChips];
  const selectedChip = allChips.find((chip) => chip.id === defaultStyleId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="shrink-0 text-muted-foreground">通用画风</span>
        <span className="min-w-0 text-foreground">{universal ? universal.summary : "正在读取…"}</span>
        <Link
          to="/settings/art-style"
          className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          修改
        </Link>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">时代风格</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {worldQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">正在加载画风…</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {allChips.map((chip) => (
                  <Button
                    key={chip.id}
                    type="button"
                    size="sm"
                    variant={defaultStyleId === chip.id ? "default" : "outline"}
                    disabled={defaultMutation.isPending}
                    onClick={() => defaultMutation.mutate(chip.id)}
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
              {selectedChip ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  当前：{selectedChip.label}——{selectedChip.summary}
                </p>
              ) : null}
            </>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">自定义时代风格</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLibrary((prev) => [...prev, { label: "", prompt: "", initialLabel: "" }])}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  添加
                </Button>
                <Button
                  size="sm"
                  onClick={() => libraryMutation.mutate()}
                  disabled={libraryMutation.isPending || labelInvalid || (hydrated && library.length === 0 && savedCustoms.length === 0)}
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
            {labelInvalid ? (
              <p className="text-xs text-destructive">每个画风都要有名字，且不能重名。</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
