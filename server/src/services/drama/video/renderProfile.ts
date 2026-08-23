export interface DramaRenderProfile {
  id: "720p" | "1080p";
  width: number;
  height: number;
  fps: 24;
}

export const DRAMA_RENDER_PROFILE_IDS = ["720p", "1080p"] as const satisfies readonly DramaRenderProfile["id"][];

export const DRAMA_RENDER_PROFILES: Record<DramaRenderProfile["id"], DramaRenderProfile> = {
  "720p": { id: "720p", width: 1280, height: 720, fps: 24 },
  "1080p": { id: "1080p", width: 1920, height: 1080, fps: 24 },
};

export function assertLandscape16x9(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * 9 !== height * 16) {
    throw new Error(`漫剧视频必须使用横屏 16:9 分辨率，收到 ${width}x${height}`);
  }
}

export function getDramaRenderProfiles(): DramaRenderProfile[] {
  return DRAMA_RENDER_PROFILE_IDS.map((id) => ({ ...DRAMA_RENDER_PROFILES[id] }));
}

export function getDramaRenderProfileById(value: unknown): DramaRenderProfile {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!DRAMA_RENDER_PROFILE_IDS.includes(id as DramaRenderProfile["id"])) {
    throw new Error(`不支持的漫剧视频分辨率配置：${String(value || "未设置")}，可选 720p 或 1080p`);
  }
  const profile = DRAMA_RENDER_PROFILES[id as DramaRenderProfile["id"]];
  assertLandscape16x9(profile.width, profile.height);
  return { ...profile };
}

export function getDramaRenderProfile(env: Record<string, string | undefined> = process.env): DramaRenderProfile {
  return getDramaRenderProfileById(env.DRAMA_VIDEO_PROFILE?.trim() || "720p");
}

export function audioFileExtensionFromDataUrl(dataUrl: string): "wav" | "mp3" | "bin" {
  const mime = /^data:([^;]+);/i.exec(dataUrl.trim())?.[1]?.toLowerCase() ?? "";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "bin";
}
