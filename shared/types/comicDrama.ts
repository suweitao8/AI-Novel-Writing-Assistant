// 漫剧工作流共享类型：漫剧项目（productionKind=comic_drama 的小说）与 drama 分镜管线的阶段投影。
// 漫剧 = 写小说（空白小说流程）→ 影视分镜 → 配音 → 视频，studio 投影把两个 bounded context 的
// 进度合并成一份阶段视图，前端只消费这一层，不直接拼装 Novel 与 DramaProject。

export type ComicDramaStageKey = "novel" | "storyboard" | "voice" | "video";

/** 全景图与 3D 环境之间唯一固定的垂直投射分界（地平线，v 从顶部计）。 */
export const STORY_SCENE_3D_PANORAMA_HORIZON_V = 0.5 as const;

/**
 * 全景图天空区分界（v 从顶部计）：v<0.3 为纯天空/天花板，v=0.3-0.5 为远景带，
 * 与从底部计的 70% 分界等价。生成提示词（scenePanoramaLayout）与状态编辑器
 * 平面图的构图参考线都以此为准。
 */
export const STORY_SCENE_3D_PANORAMA_SKY_V = 0.3 as const;

/**
 * 场景资产的统一 3D 环境参数。投射中心高度和半球直径由场景资产维护，
 * 分镜只读取这份配置；yaw/intensity 保留在数据合同中用于兼容旧分镜快照，
 * 当前产品固定为 0 / 1。
 */
export interface StoryScene3DEnvironment {
  projectionCenterHeight: number;
  domeRadius: number;
  yawDeg: number;
  intensity: number;
}

export type StoryScene3DEnvironmentInput = Pick<StoryScene3DEnvironment, "projectionCenterHeight" | "domeRadius">;

/** 场景状态全景图中供角色摆位参考的固定空间物体类别。 */
export const STORY_SCENE_3D_MARKER_KINDS = [
  "bed",
  "table",
  "chair",
  "sofa",
  "desk",
  "cabinet",
  "shelf",
  "door",
  "window",
  "counter",
  "stair",
  "other",
] as const;

export type StoryScene3DMarkerKind = (typeof STORY_SCENE_3D_MARKER_KINDS)[number];

export const STORY_SCENE_3D_MARKER_KIND_LABELS: Record<StoryScene3DMarkerKind, string> = {
  bed: "床",
  table: "桌子",
  chair: "椅子",
  sofa: "沙发",
  desk: "书桌",
  cabinet: "柜子",
  shelf: "架子",
  door: "门",
  window: "窗户",
  counter: "柜台",
  stair: "楼梯",
  other: "固定物体",
};

export type StoryScene3DMarkerAnchor = "floor" | "wall" | "ceiling";
export type StoryScene3DVector3 = [number, number, number];

export interface StoryScene3DMarkerImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoryScene3DMarker {
  id: string;
  kind: StoryScene3DMarkerKind;
  label: string;
  anchor: StoryScene3DMarkerAnchor;
  /** 世界坐标，单位米；position 是长方体中心，地面锚点由归一化器落地。 */
  position: StoryScene3DVector3;
  /** 长方体尺寸，分别为 X/Y/Z，单位米。 */
  size: StoryScene3DVector3;
  yawDeg: number;
  confidence: number;
  imageRegion?: StoryScene3DMarkerImageRegion;
  evidence?: string;
  source?: "ai" | "manual";
}

export interface StoryScene3DMarkerSet {
  schemaVersion: 1;
  status: "ready" | "error" | "stale";
  sourceImageArtifactId?: string | null;
  sourceImageGeneratedAt?: string | null;
  /** 生成这些坐标时使用的场景投射参数；缺失时只能视为旧版标记。 */
  sourceEnvironment?: StoryScene3DEnvironmentInput;
  analyzedAt?: string;
  analysisNote?: string;
  error?: string;
  markers: StoryScene3DMarker[];
}

const STORY_SCENE_3D_MARKER_ANCHORS = new Set<StoryScene3DMarkerAnchor>(["floor", "wall", "ceiling"]);

function isStoryScene3DEnvironmentInput(value: unknown): value is StoryScene3DEnvironmentInput {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.projectionCenterHeight === "number"
    && Number.isFinite(source.projectionCenterHeight)
    && typeof source.domeRadius === "number"
    && Number.isFinite(source.domeRadius);
}

/** 环境参数改变任一投射量时，旧标记就不能继续代表当前场景。 */
export function storyScene3DEnvironmentMatches(
  left: StoryScene3DEnvironmentInput | null | undefined,
  right: StoryScene3DEnvironmentInput | null | undefined,
): boolean {
  if (!left || !right) return false;
  return Math.abs(left.projectionCenterHeight - right.projectionCenterHeight) < 0.0001
    && Math.abs(left.domeRadius - right.domeRadius) < 0.0001;
}

/** 只有带环境快照且与当前环境一致的结果才能进入 3D 摆位上下文。 */
export function isStoryScene3DMarkerSetCurrent(
  markerSet: Pick<StoryScene3DMarkerSet, "status" | "sourceEnvironment"> | null | undefined,
  environment: StoryScene3DEnvironmentInput | null | undefined,
): boolean {
  return markerSet?.status === "ready"
    && storyScene3DEnvironmentMatches(markerSet.sourceEnvironment, environment);
}

/** 只判断持久化结构是否可安全保留；数值范围由服务端归一化器负责。 */
export function isStoryScene3DMarkerSet(value: unknown): value is StoryScene3DMarkerSet {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1
    || (source.status !== "ready" && source.status !== "error" && source.status !== "stale")
    || !Array.isArray(source.markers)) {
    return false;
  }
  if (source.sourceEnvironment !== undefined && !isStoryScene3DEnvironmentInput(source.sourceEnvironment)) {
    return false;
  }
  return source.markers.every((item) => {
    if (!item || typeof item !== "object") return false;
    const marker = item as Record<string, unknown>;
    return typeof marker.id === "string"
      && typeof marker.kind === "string"
      && STORY_SCENE_3D_MARKER_KINDS.includes(marker.kind as StoryScene3DMarkerKind)
      && typeof marker.label === "string"
      && typeof marker.anchor === "string"
      && STORY_SCENE_3D_MARKER_ANCHORS.has(marker.anchor as StoryScene3DMarkerAnchor)
      && Array.isArray(marker.position)
      && marker.position.length === 3
      && Array.isArray(marker.size)
      && marker.size.length === 3
      && typeof marker.yawDeg === "number"
      && typeof marker.confidence === "number";
  });
}

export interface ComicDramaLinkStats {
  projectId: string;
  projectTitle: string;
  status: string;
  visualStyle: string | null;
  updatedAt: string;
  episodeCount: number;
  scriptedEpisodeCount: number;
  storyboardCount: number;
  shotCount: number;
  keyframeReadyCount: number;
  audioReadyCount: number;
  videoPromptCount: number;
  videoReadyCount: number;
}

export interface ComicDramaLinksResponse {
  links: Record<string, ComicDramaLinkStats | null>;
}

export interface ComicDramaNovelSummary {
  id: string;
  title: string;
  description: string | null;
  productionKind: string;
  narrativeForm: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  referenceDocument: {
    id: string;
    title: string;
    fileName: string | null;
    charCount: number;
  } | null;
  directorTask: {
    id: string;
    status: string;
    checkpointSummary: string | null;
    currentItemLabel: string | null;
    progress: number;
  } | null;
}

export interface ComicDramaStudioOverview {
  novel: ComicDramaNovelSummary;
  drama: ComicDramaLinkStats | null;
  videoProviders: Array<{ id: string; label: string; kind: string; isDefault: boolean }>;
}
