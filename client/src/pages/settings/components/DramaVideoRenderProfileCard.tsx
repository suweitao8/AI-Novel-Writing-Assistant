import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDramaVideoRenderProfileSettings,
  saveDramaVideoRenderProfileSettings,
  type DramaVideoRenderProfileId,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const PROFILE_LABELS: Record<DramaVideoRenderProfileId, string> = {
  "720p": "720P（1280×720）",
  "1080p": "1080P（1920×1080）",
};

export default function DramaVideoRenderProfileCard() {
  const queryClient = useQueryClient();
  const [selectedProfile, setSelectedProfile] = useState<DramaVideoRenderProfileId>("720p");
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.dramaVideoRenderProfile,
    queryFn: getDramaVideoRenderProfileSettings,
  });
  const settings = settingsQuery.data?.data;

  useEffect(() => {
    if (settings?.profile.id) {
      setSelectedProfile(settings.profile.id);
    }
  }, [settings?.profile.id]);

  const saveMutation = useMutation({
    mutationFn: (profile: DramaVideoRenderProfileId) => saveDramaVideoRenderProfileSettings({ profile }),
    onSuccess: async (response) => {
      if (response.data?.profile.id) {
        setSelectedProfile(response.data.profile.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.dramaVideoRenderProfile });
      toast.success(response.message ?? "视频输出设置已保存。");
    },
    onError: (error: Error) => {
      toast.error("视频输出设置保存失败。", { description: error.message });
    },
  });

  const currentProfile = settings?.profile;
  const isDirty = Boolean(currentProfile && selectedProfile !== currentProfile.id);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>视频输出</CardTitle>
          <CardDescription>选择后续整集合成使用的画面分辨率。</CardDescription>
        </div>
        {currentProfile ? (
          <Badge variant="outline">{currentProfile.width}×{currentProfile.height} · {currentProfile.fps}fps</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">读取视频输出设置中...</div>
        ) : settingsQuery.isError ? (
          <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>视频输出设置读取失败。</span>
            <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()}>
              重新读取
            </Button>
          </div>
        ) : settings ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <label htmlFor="drama-video-render-profile" className="text-sm font-medium">
                输出分辨率
              </label>
              <SelectControl
                id="drama-video-render-profile"
                value={selectedProfile}
                onChange={(event) => setSelectedProfile(event.target.value as DramaVideoRenderProfileId)}
                disabled={saveMutation.isPending}
                aria-label="输出分辨率"
              >
                {settings.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {PROFILE_LABELS[option.id]}
                  </option>
                ))}
              </SelectControl>
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() => saveMutation.mutate(selectedProfile)}
              disabled={!isDirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? "保存中..." : "保存设置"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
