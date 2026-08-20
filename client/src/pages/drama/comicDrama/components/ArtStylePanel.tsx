import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { DramaVisualStyle } from "@/api/media/drama";
import { getStorySettingsWorld, updateStorySettingsWorld } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

// 「设定 · 美术风格」工作面：整本作品的画风体系。
// - 默认风格：章节开头与封面/立绘/首帧图的基准画风，点选即存；
// - 风格库：内置风格只读，自定义风格（如 现代→末世 的多套画风）按本小说自由定义；
// - 章节初稿里用「【风格：风格名】」切换画风，切换后一直生效到下一个【风格：…】，
//   与【场景：…】换场、【角色状态：…】换形象的机制一致。
interface ArtStylePanelProps {
  novelId: string;
  /** 内置风格预设（GET /drama/visual-styles），第一项是内置默认风格。 */
  styleOptions: DramaVisualStyle[];
  /** 已创建分镜项目时，默认风格变化会同步推送给分镜项目。 */
  onApplyProjectStyle: (styleId: string) => void;
  onChanged?: () => void | Promise<void>;
}

interface ArtStyleDraft {
  label: string;
  prompt: string;
  /** 进入编辑时的名字：用于识别「改名」并让默认风格跟着改名走。 */
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
      toast.success("默认美术风格已保存，之后生成的画面与视频会用这个画风。");
    },
    onError: (error) => {
      toast.error("保存默认风格失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const labels = library.map((style) => style.label.trim());
  const labelInvalid = labels.some((label, index) => !label || labels.indexOf(label) !== index);

  const libraryMutation = useMutation({
    mutationFn: () => {
      const artStyles = library
        .map((style) => ({ label: style.label.trim(), prompt: style.prompt.trim() }))
        .filter((style) => style.label);
      // 默认风格指向的自定义风格被改名时，默认引用跟着新名字走；
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
      toast.success("风格库已保存。");
    },
    onError: (error) => {
      toast.error("保存风格库失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const updateEntry = (index: number, patch: Partial<Pick<ArtStyleDraft, "label" | "prompt">>) => {
    setLibrary((prev) => prev.map((style, i) => (i === index ? { ...style, ...patch } : style)));
  };

  const removeEntry = (index: number) => {
    const entry = library[index];
    if (entry && entry.initialLabel && !window.confirm(`删除风格「${entry.initialLabel}」？初稿里已有的【风格：…】标记不会被自动改写。`)) {
      return;
    }
    setLibrary((prev) => prev.filter((_, i) => i !== index));
  };

  const customChips = savedCustoms.map((style) => ({ id: style.label, label: style.label, summary: style.prompt }));
  const allChips = [...props.styleOptions, ...customChips];
  const selectedChip = allChips.find((chip) => chip.id === defaultStyleId) ?? null;

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">默认美术风格</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            整本作品画面与视频的基准画风：封面、角色形象、章节开头都用它。
            剧情画风转变时（末世爆发、进入异世界），在章节初稿里写「【风格：风格名】」即可切换，切换后一直生效到下一个【风格：…】。
          </p>
          {worldQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">正在加载风格…</div>
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
                  当前默认：{selectedChip.label}——{selectedChip.summary}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between space-y-0 gap-2">
          <CardTitle className="text-base">风格库</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLibrary((prev) => [...prev, { label: "", prompt: "", initialLabel: "" }])}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              添加自定义风格
            </Button>
            <Button
              size="sm"
              onClick={() => libraryMutation.mutate()}
              disabled={libraryMutation.isPending || labelInvalid || (hydrated && library.length === 0 && savedCustoms.length === 0)}
            >
              {libraryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {libraryMutation.isPending ? "保存中..." : "保存风格库"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">内置风格</span>
              <Badge variant="outline">全小说通用</Badge>
            </div>
            {props.styleOptions.map((preset) => (
              <div key={preset.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{preset.label}</span>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{preset.summary}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">自定义风格</span>
            <p className="text-xs leading-5 text-muted-foreground">
              把这本书特有的画风定义成一个个风格（例如：「现代诡异」「末世爆发后」），初稿切换与画面生成都会按名字使用它们。
            </p>
            {library.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                还没有自定义风格。一本书保持一种画风时不需要添加；需要中途切换画风再加。
              </p>
            ) : (
              library.map((style, index) => (
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
                      aria-label="删除风格"
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
              ))
            )}
            {labelInvalid ? (
              <p className="text-xs text-destructive">每个风格都要有名字，且不能重名。</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
