import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Trash2 } from "lucide-react";
import { getStorySettingsWorld, regenerateStorySettings, updateStorySettingsWorld } from "@/api/story/storySettings";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import SettingsWorldMapView from "./SettingsWorldMapView";

interface SettingsWorldTabProps {
  novelId: string;
  onChanged?: () => void | Promise<void>;
  // 漫剧工作室里地图有独立页签（WorldMapPanel），这里不再内嵌只读小地图。
  showMap?: boolean;
}

interface WorldFormState {
  premise: string;
  era: string;
  toneRulesText: string;
  keySettings: Array<{ title: string; content: string }>;
}

// 世界观工作面：关键设定条目优先——一个条目讲清一个概念（丧尸是什么、异能怎么运作），
// 基本图景（前提/时代/基调）收在下方；可编辑地图由独立的世界地图工作面负责。
export default function SettingsWorldTab({ novelId, onChanged, showMap = true }: SettingsWorldTabProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WorldFormState>({
    premise: "",
    era: "",
    toneRulesText: "",
    keySettings: [],
  });
  const [hydrated, setHydrated] = useState(false);

  const worldQuery = useQuery({
    queryKey: queryKeys.novels.storySettingsWorld(novelId),
    queryFn: () => getStorySettingsWorld(novelId),
  });
  const world = worldQuery.data?.data;

  useEffect(() => {
    if (!world || hydrated) {
      return;
    }
    setHydrated(true);
    setForm({
      premise: world.premise,
      era: world.era ?? "",
      toneRulesText: world.toneRules.join("\n"),
      keySettings: world.keySettings.map((setting) => ({ ...setting })),
    });
  }, [hydrated, world]);

  const invalidate = async () => {
    setHydrated(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsWorld(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storySettingsOverview(novelId) }),
    ]);
    await onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: () => updateStorySettingsWorld(novelId, {
      premise: form.premise.trim(),
      era: form.era.trim() || null,
      toneRules: form.toneRulesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      keySettings: form.keySettings
        .map((setting) => ({ title: setting.title.trim(), content: setting.content.trim() }))
        .filter((setting) => setting.title && setting.content),
    }),
    onSuccess: async () => {
      toast.success("世界观已保存。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("世界观保存失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateStorySettings(novelId, "world"),
    onSuccess: async () => {
      toast.success("世界观已重新生成。");
      await invalidate();
    },
    onError: (error) => {
      toast.error("世界观生成失败。", { description: error instanceof Error ? error.message : undefined });
    },
  });

  const updateKeySetting = (index: number, patch: Partial<{ title: string; content: string }>) => {
    setForm((prev) => ({
      ...prev,
      keySettings: prev.keySettings.map((setting, i) => (i === index ? { ...setting, ...patch } : setting)),
    }));
  };

  const removeKeySetting = (index: number) => {
    setForm((prev) => ({
      ...prev,
      keySettings: prev.keySettings.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          这个世界的关键概念一条一条写清楚（例如：丧尸是什么、异能怎么运作），后续写作都以此为准。
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.premise.trim()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending ? "保存中..." : "保存设定"}
          </Button>
          <AiButton
            variant="outline"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {regenerateMutation.isPending ? "生成中..." : "AI 生成世界观"}
          </AiButton>
        </div>
      </div>

      {worldQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">正在加载世界观...</div>
      ) : (
        <>
          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">关键设定</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm((prev) => ({ ...prev, keySettings: [...prev.keySettings, { title: "", content: "" }] }))}
              >
                添加条目
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.keySettings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  还没有关键设定条目。把这个世界特有的概念一条条加进来，或点「AI 生成世界观」让 AI 起草。
                </p>
              ) : (
                form.keySettings.map((setting, index) => (
                  <div key={index} className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={setting.title}
                        placeholder="概念名，例如：丧尸"
                        className="h-8 max-w-[240px]"
                        onChange={(event) => updateKeySetting(index, { title: event.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        aria-label="删除条目"
                        onClick={() => removeKeySetting(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <textarea
                      rows={2}
                      className="min-h-[56px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                      placeholder="具体解释这个概念：它是什么、规则是什么、有什么限制。"
                      value={setting.content}
                      onChange={(event) => updateKeySetting(index, { content: event.target.value })}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">基本设定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">世界前提</span>
                <Input
                  value={form.premise}
                  placeholder="这个世界的基本图景与核心张力"
                  onChange={(event) => setForm((prev) => ({ ...prev, premise: event.target.value }))}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">时代背景</span>
                  <Input
                    value={form.era}
                    placeholder="例如：近未来 / 架空古代"
                    onChange={(event) => setForm((prev) => ({ ...prev, era: event.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">基调规则（每行一条）</span>
                  <Input
                    value={form.toneRulesText}
                    placeholder="例如：低魔世界，能力有代价"
                    onChange={(event) => setForm((prev) => ({ ...prev, toneRulesText: event.target.value }))}
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          {showMap ? (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">世界地图</CardTitle>
              </CardHeader>
              <CardContent>
                <SettingsWorldMapView map={world?.map ?? { overview: "", nodes: [], edges: [] }} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
