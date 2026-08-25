import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { StoryScene3DEnvironment } from "@ai-novel/shared/types/comicDrama";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "@/api/media/comic";
import { apiClient } from "../client";

export type DramaSourceType = "novel_import" | "original" | "text_import";

export interface DramaLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface DramaTrackRecommendation {
  recommendedTrack: string;
  reason: string;
  fitSignals: string[];
  risks: string[];
  alternatives: Array<{
    track: string;
    reason: string;
  }>;
}

export interface DramaSourceSupplementGuidance {
  readiness: "ready" | "needs_supplement" | "needs_rebuild";
  summary: string;
  missingItems: Array<{
    area: string;
    problem: string;
    impact: string;
  }>;
  questions: Array<{
    question: string;
    guidance: string;
    priority: "high" | "medium" | "low";
  }>;
  nextAction: "continue" | "supplement_notes" | "rebuild_source_bundle";
}

export interface CreateDramaProjectPayload {
  title: string;
  source: DramaSourceType;
  sourceRef?: string;
  track?: string;
  theme?: string;
  targetEpisodes?: number;
  visualStyle?: string;
  inspiration?: string;
  rawText?: string;
}

export interface DramaProject {
  id: string;
  title: string;
  source: DramaSourceType;
  sourceRef?: string | null;
  sourceInput?: string | null;
  track?: string | null;
  theme?: string | null;
  orientation: string;
  targetEpisodes: number;
  strategy?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DramaEpisode {
  id: string;
  projectId: string;
  order: number;
  title: string;
  content?: string | null;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  hookType?: string | null;
  isPaywall: boolean;
  emotionNet?: number | null;
  beatSheet?: string | null;
  sourceMap?: string | null;
  durationSec?: number | null;
  status: string;
  qualityFlags?: string | null;
  /** 整集合成结果 JSON（DramaAssembledVideoData） */
  assembledVideoData?: string | null;
  storyboards?: DramaStoryboard[];
  videoPrompts?: DramaVideoPrompt[];
}

export interface DramaSourceBundle {
  id: string;
  projectId: string;
  synopsis?: string | null;
  beats?: string | null;
  worldNotes?: string | null;
  hardFacts?: string | null;
  rawText?: string | null;
}

export interface DramaCharacterPortraitData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: DramaGenerationHistoryItem[];
}

export interface DramaCharacterThreeViewItem {
  view: "front" | "side" | "back";
  status: "idle" | "generating" | "done" | "error";
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

export interface DramaCharacter {
  id: string;
  projectId?: string;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  speechStyle?: string | null;
  visualAnchor?: string | null;
  voiceProfile?: string | null;
  relations?: string | null;
  /** JSON 字符串，解析为 DramaCharacterPortraitData */
  portraitData?: string | null;
  /** JSON 字符串，解析为 DramaCharacterThreeViewItem[] */
  threeViewData?: string | null;
}

export interface DramaGenerationHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface DramaShotKeyframeData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: DramaGenerationHistoryItem[];
}

export interface DramaShotBlockingSketchScene {
  assetId: string;
  stateId: string;
  imageUrl: string;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
}

export interface DramaShotBlockingSketchActor {
  characterName: string;
  assetId?: string;
  stateId?: string;
  imageUrl?: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  zIndex: number;
}

export type DramaShotBlockingSketchPose =
  | "standing"
  | "talking"
  | "arms_crossed"
  | "sitting"
  | "crouching"
  | "kneeling"
  | "lying"
  | "prone"
  | "walking"
  | "running"
  | "pointing"
  | "holding"
  | "interacting"
  | "fighting"
  | "sword";

export interface DramaShotBlockingSketch3DCamera {
  azim: number;
  elev: number;
  distance: number;
  focalPoint: [number, number, number];
}

export interface DramaShotBlockingSketch3DActor {
  characterName: string;
  position: [number, number, number];
  yawDeg: number;
  scale: [number, number, number];
  pose: DramaShotBlockingSketchPose;
  /** Legacy compatibility marker; the 3D sketch always stores a paused key frame. */
  actionPlaying: boolean;
}

export interface DramaShotBlockingSketch3DEnvironment {
  projectionCenterHeight: number;
  domeRadius: number;
  yawDeg: number;
  intensity: number;
}

export interface DramaShotBlockingSketch3DLayout {
  schemaVersion: 1;
  engine: "playcanvas";
  camera: DramaShotBlockingSketch3DCamera;
  actors: DramaShotBlockingSketch3DActor[];
  environment?: DramaShotBlockingSketch3DEnvironment;
}

export interface DramaShotBlockingSketchData {
  status: "draft" | "confirmed";
  version: number;
  url?: string;
  generatedAt?: string;
  scene: DramaShotBlockingSketchScene;
  actors: DramaShotBlockingSketchActor[];
  layout3d?: DramaShotBlockingSketch3DLayout;
}

export interface DramaShotBlockingSketchEditorContext {
  sketch: DramaShotBlockingSketchData | null;
  scene: {
    name: string;
    assetId: string;
    stateId: string;
    imageUrl: string;
    environment: StoryScene3DEnvironment;
  } | null;
  actors: Array<{
    characterName: string;
    assetId?: string;
    stateId?: string;
    imageUrl?: string;
    sourceImageKind: "state_sheet" | "portrait" | "placeholder";
  }>;
}

export interface DramaDialogueAudioItem {
  lineIndex: number;
  speaker?: string;
  text: string;
  voiceId?: string;
  audioUrl: string;
  durationSec?: number;
  provider: string;
}

export interface DramaDialogueAudioData {
  status: "idle" | "generating" | "done" | "error";
  provider?: string;
  items?: DramaDialogueAudioItem[];
  generatedAt?: string;
  error?: string;
}

export interface DramaCharacterLibraryItem {
  id: string;
  projectId?: string | null;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  speechStyle?: string | null;
  visualAnchor?: string | null;
  voiceProfile?: string | null;
  relations?: string | null;
  tags?: string | null;
}

export interface DramaShot {
  id: string;
  storyboardId: string;
  order: number;
  shotSize?: string | null;
  cameraMove?: string | null;
  durationSec?: number | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  /** 每镜角色状态 JSON（[{name,state}]）：这一镜各角色所处的外观状态 */
  characterStates?: string | null;
  visualPrompt?: string | null;
  keyframeData?: string | null;
  blockingSketchData?: string | null;
  dialogueAudioData?: string | null;
}

export interface DramaStoryboard {
  id: string;
  projectId: string;
  episodeId: string;
  version: number;
  status: string;
  summary?: string | null;
  shots?: DramaShot[];
}

export interface DramaVideoPrompt {
  id: string;
  projectId: string;
  episodeId?: string | null;
  shotId?: string | null;
  provider: string;
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  durationSec?: number | null;
  status: string;
  version?: number;
  supersededById?: string | null;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  failureReason?: string | null;
  providerResult?: string | null;
}

export interface DramaVideoProvider {
  provider: string;
  label: string;
  description?: string;
  supportsRefImages: boolean;
  costPerSecond?: number;
  currency?: string;
  isDefault: boolean;
}

export interface DramaTTSProvider {
  provider: string;
  label: string;
  description?: string;
  costPerSecond?: number;
  currency?: string;
}

export type DramaShotBatchJobType = "keyframes" | "videos" | "tts";
export type DramaBatchJobType = DramaShotBatchJobType | "full_episode";

export interface DramaBatchProgress {
  total: number;
  done: number;
  failed: number;
  skipped?: number;
  failedShotIds: string[];
  provider?: string;
  targetShotIds?: string[];
  currentShotId?: string;
  concurrency?: number;
  errors?: Array<{ shotId: string; message: string }>;
  useCharacterRefImages?: boolean;
  cost?: DramaBatchCostBreakdown;
  /** full_episode 整集合成任务专用：阶段与产物 */
  phase?: "prepare" | "audio" | "render" | "mux" | "done";
  videoUrl?: string;
  srtUrl?: string;
  durationSec?: number;
  error?: string;
  /** full_episode 各阶段的运行耗时，用于定位本地合成瓶颈。 */
  timings?: {
    prepareMs?: number;
    audioMs?: number;
    renderMs?: number;
    muxMs?: number;
    totalMs?: number;
  };
}

export interface DramaBatchCostUnits {
  images?: number;
  seconds?: number;
  shots?: number;
  lines?: number;
}

export interface DramaBatchCostBreakdown {
  currency: string;
  estimated: number;
  actual: number;
  estimatedUnits: DramaBatchCostUnits;
  actualUnits: DramaBatchCostUnits;
  unit: {
    costPerImage?: number;
    costPerSecond?: number;
  };
}

export interface DramaBatchEstimate {
  type: DramaBatchJobType;
  provider: string;
  total: number;
  targetShotIds: string[];
  cost: DramaBatchCostBreakdown;
}

export interface DramaBatchJob {
  id: string;
  projectId: string;
  episodeId?: string | null;
  type: DramaBatchJobType;
  status: "pending" | "running" | "paused" | "done" | "failed";
  progress: string;
  createdAt: string;
  updatedAt: string;
}

export interface DramaComplianceReport {
  level: "pass" | "warn" | "block";
  items: Array<{
    rule: string;
    excerpt: string;
    suggestion: string;
  }>;
}

export interface DramaComplianceBatchResult {
  checked: number;
  pass: number;
  warn: number;
  block: number;
  results: Array<{
    episodeOrder: number;
    title: string;
    level: DramaComplianceReport["level"];
    itemCount: number;
  }>;
}

export type DramaProjectDetail = DramaProject & {
  sourceBundle?: DramaSourceBundle | null;
  characters?: DramaCharacter[];
  episodes?: DramaEpisode[];
  videoPrompts?: DramaVideoPrompt[];
  batchJobs?: DramaBatchJob[];
}

export interface DramaVisualStyle {
  id: string;
  label: string;
  summary: string;
  styleTag: string;
  /** custom=全局自定义时代画风（id 即风格名）。 */
  styleFamily: "animation" | "live_action" | "custom";
}

export async function getDramaVisualStyles() {
  const { data } = await apiClient.get<ApiResponse<DramaVisualStyle[]>>("/drama/visual-styles");
  return data;
}

/** 全局自定义时代画风（画风管理页编辑，全部小说与漫剧项目共用）。 */
export interface DramaEraStyleCustom {
  label: string;
  prompt: string;
}

export interface DramaEraStyleLibraryData {
  styles: DramaEraStyleCustom[];
}

export async function getDramaEraStyles() {
  const { data } = await apiClient.get<ApiResponse<DramaEraStyleLibraryData>>("/drama/era-styles");
  return data;
}

export async function saveDramaEraStyles(styles: DramaEraStyleCustom[]) {
  const { data } = await apiClient.put<ApiResponse<DramaEraStyleLibraryData>>("/drama/era-styles", { styles });
  return data;
}

/** 小说当前生效的时代风格：novel-default=小说默认，builtin=内置默认（脚本标记层已移除，
 *  时代风格由资产状态自带）。 */
export interface DramaEraStyleInfo {
  key: string;
  label: string;
  source: "novel-default" | "builtin";
}

export async function getDramaEraStyle(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<DramaEraStyleInfo>>(
    `/drama/era-style/${encodeURIComponent(novelId)}`,
  );
  return data;
}

export async function setDramaVisualStyle(projectId: string, styleId: string | null) {
  const { data } = await apiClient.post<ApiResponse<{ id: string; visualStyle: string | null }>>(
    `/drama/projects/${encodeURIComponent(projectId)}/visual-style`,
    { styleId },
  );
  return data;
}

export async function createDramaProject(payload: CreateDramaProjectPayload) {
  const { data } = await apiClient.post<ApiResponse<DramaProject>>("/drama/projects", payload);
  return data;
}

export async function getDramaProject(id: string) {
  const { data } = await apiClient.get<ApiResponse<DramaProjectDetail>>(`/drama/projects/${id}`);
  return data;
}

export async function assembleDramaSourceBundle(id: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/source-bundle`, {});
  return data;
}

export interface ComicDramaStoryboardGenerationPayload extends DramaLLMOptions {
  visualStyle?: string;
}

export interface ComicDramaStoryboardGenerationResult {
  projectId: string;
  episodeOrder: number;
  episode: DramaEpisode;
  storyboard: DramaStoryboard | null;
}

export async function generateComicDramaStoryboard(
  novelId: string,
  order: number,
  payload: ComicDramaStoryboardGenerationPayload = {},
) {
  const { data } = await apiClient.post<ApiResponse<ComicDramaStoryboardGenerationResult>>(
    `/drama/studio/${encodeURIComponent(novelId)}/chapters/${order}/storyboard`,
    payload,
  );
  return data;
}

export async function analyzeDramaSourceSupplement(id: string, payload: DramaLLMOptions & {
  userSupplement?: string;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<DramaSourceSupplementGuidance>>(
    `/drama/projects/${id}/source-supplement`,
    payload,
  );
  return data;
}

export async function generateDramaStrategy(id: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/strategy`, payload);
  return data;
}

export async function generateDramaOutline(id: string, payload: DramaLLMOptions & {
  startOrder?: number;
  count?: number;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/outline`, payload);
  return data;
}

export async function generateDramaEpisodeScript(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/script`, payload);
  return data;
}

export async function updateDramaEpisode(id: string, order: number, payload: {
  title?: string;
  content?: string;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  durationSec?: number | null;
}) {
  const { data } = await apiClient.patch<ApiResponse<DramaEpisode>>(`/drama/projects/${id}/episodes/${order}`, payload);
  return data;
}

export async function reviewDramaEpisode(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/review`, payload);
  return data;
}

export async function checkDramaProjectCompliance(id: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<DramaComplianceBatchResult>>(
    `/drama/projects/${id}/compliance`,
    payload,
  );
  return data;
}

export async function repairDramaEpisode(id: string, order: number, payload: DramaLLMOptions & {
  instruction?: string;
} = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/repair`, payload);
  return data;
}

export async function updateDramaCharacter(id: string, characterId: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch<ApiResponse<unknown>>(`/drama/projects/${id}/characters/${characterId}`, payload);
  return data;
}

export async function saveDramaCharacterToLibrary(id: string, characterId: string, tags?: string[]) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `/drama/projects/${id}/characters/${characterId}/save-to-library`,
    { tags },
  );
  return data;
}

export async function listDramaCharacterLibrary(projectId?: string) {
  const { data } = await apiClient.get<ApiResponse<DramaCharacterLibraryItem[]>>("/drama/character-library", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function importDramaCharacterFromLibrary(id: string, libraryId: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/character-library/import`, {
    libraryId,
  });
  return data;
}

export async function generateDramaStoryboard(id: string, order: number, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/episodes/${order}/storyboard`, payload);
  return data;
}

export async function listDramaVideoProviders() {
  const { data } = await apiClient.get<ApiResponse<DramaVideoProvider[]>>("/drama/video-providers");
  return data;
}

export async function listDramaTTSProviders() {
  const { data } = await apiClient.get<ApiResponse<DramaTTSProvider[]>>("/drama/tts-providers");
  return data;
}

export async function generateDramaVideoPrompt(id: string, shotId: string, payload: DramaLLMOptions = {}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/projects/${id}/shots/${shotId}/video-prompt`, payload);
  return data;
}

// 手动编辑镜头（台词/动作/景别/运镜/时长/场景）；台词改动后配音段自动标记过期需重配
export async function updateDramaShot(
  id: string,
  shotId: string,
  payload: Partial<{
    action: string;
    dialogue: string;
    shotSize: string;
    cameraMove: string;
    location: string;
    durationSec: number;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<DramaShot>>(`/drama/projects/${id}/shots/${shotId}`, payload);
  return data;
}

export async function getDramaShotBlockingSketch(id: string, shotId: string) {
  const { data } = await apiClient.get<ApiResponse<DramaShotBlockingSketchEditorContext>>(
    `/drama/projects/${id}/shots/${shotId}/blocking-sketch`,
  );
  return data;
}

export async function saveDramaShotBlockingSketch(
  id: string,
  shotId: string,
  data: DramaShotBlockingSketchData,
) {
  const response = await apiClient.put<ApiResponse<DramaShotBlockingSketchData>>(
    `/drama/projects/${id}/shots/${shotId}/blocking-sketch`,
    { data },
  );
  return response.data;
}

export async function uploadDramaShotBlockingSketchPng(id: string, shotId: string, png: Blob) {
  const { data } = await apiClient.post<ApiResponse<DramaShotBlockingSketchData>>(
    `/drama/projects/${id}/shots/${shotId}/blocking-sketch/image`,
    png,
    { headers: { "Content-Type": "image/png" } },
  );
  return data;
}

export async function confirmDramaShotBlockingSketch(id: string, shotId: string) {
  const { data } = await apiClient.post<ApiResponse<DramaShotBlockingSketchData>>(
    `/drama/projects/${id}/shots/${shotId}/blocking-sketch/confirm`,
    {},
  );
  return data;
}

export async function generateDramaShotKeyframe(
  id: string,
  shotId: string,
  provider?: string,
  useCharacterRefImages?: boolean,
  overrides?: ImageGenerationOverrides,
) {
  const { data } = await apiClient.post<ApiResponse<DramaShotKeyframeData>>(
    `/drama/projects/${id}/shots/${shotId}/keyframe`,
    {
      ...(provider ? { provider } : {}),
      ...(useCharacterRefImages === undefined ? {} : { useCharacterRefImages }),
      ...(overrides ?? {}),
    },
  );
  return data;
}

export async function prepareDramaShotKeyframe(
  id: string,
  shotId: string,
  provider?: string,
  useCharacterRefImages?: boolean,
): Promise<ApiResponse<ImageGenerationPreview>> {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/drama/projects/${id}/shots/${shotId}/keyframe/prepare`,
    {
      ...(provider ? { provider } : {}),
      ...(useCharacterRefImages === undefined ? {} : { useCharacterRefImages }),
    },
  );
  return data;
}

export async function createDramaVideoProviderTask(videoPromptId: string, provider?: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/video-prompts/${videoPromptId}/provider-task`, {
    ...(provider ? { provider } : {}),
  });
  return data;
}

export async function refreshDramaVideoProviderTask(videoPromptId: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(`/drama/video-prompts/${videoPromptId}/provider-task/refresh`, {});
  return data;
}

export async function createDramaEpisodeBatchJob(id: string, order: number, payload: {
  type: DramaShotBatchJobType;
  provider?: string;
  shotIds?: string[];
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
  /** keyframes/tts 强制重生成：忽略已有首帧或配音 */
  force?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<DramaBatchJob>>(
    `/drama/projects/${id}/episodes/${order}/batch-jobs`,
    payload,
  );
  return data;
}

export async function estimateDramaEpisodeBatchJob(id: string, order: number, payload: {
  type: DramaShotBatchJobType;
  provider?: string;
  shotIds?: string[];
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<DramaBatchEstimate>>(
    `/drama/projects/${id}/episodes/${order}/batch-jobs/estimate`,
    payload,
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 整集合成（full_episode）
// ─────────────────────────────────────────────────────────────────────────────

export interface DramaAssembledVideoData {
  status: "assembling" | "done" | "error";
  videoUrl?: string;
  srtUrl?: string;
  durationSec?: number;
  shotCount?: number;
  burnedSubtitles?: boolean;
  generatedAt?: string;
  error?: string;
  warnings?: string[];
}

export interface DramaEpisodeAssemblyStatus {
  episodeId: string;
  order: number;
  renderProfile?: { id: "720p" | "1080p"; width: number; height: number; fps: number };
  shotCount: number;
  clips: { withVideoClip: number; withKeyframeOnly: number; withoutVisual: number };
  withoutAudioShotCount: number;
  canAssemble: boolean;
  assembled: DramaAssembledVideoData | null;
  activeJob: DramaBatchJob | null;
}

export async function getDramaEpisodeAssembly(id: string, order: number) {
  const { data } = await apiClient.get<ApiResponse<DramaEpisodeAssemblyStatus>>(
    `/drama/projects/${id}/episodes/${order}/assembly`,
  );
  return data;
}

export async function startDramaEpisodeAssembly(
  id: string,
  order: number,
  payload: { burnSubtitles?: boolean; includeTitleCard?: boolean; includeEndCard?: boolean } = {},
) {
  const { data } = await apiClient.post<ApiResponse<DramaBatchJob>>(
    `/drama/projects/${id}/episodes/${order}/assembly`,
    payload,
  );
  return data;
}

export async function downloadDramaExport(id: string, format: "markdown" | "json") {
  const response = await apiClient.get<Blob>(`/drama/projects/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}

export type DramaEpisodeExportFormat = "srt" | "timeline-json";

export async function downloadDramaEpisodeExport(id: string, order: number, format: DramaEpisodeExportFormat) {
  const response = await apiClient.get<Blob>(`/drama/projects/${id}/episodes/${order}/export`, {
    params: { format },
    responseType: "blob",
  });
  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 角色图片生成
// ─────────────────────────────────────────────────────────────────────────────

/** 生成角色设计稿（面部特写 + 四视图合图，推荐使用） */
export async function prepareDramaCharacterSheet(
  id: string,
  characterId: string,
  provider?: string,
): Promise<ApiResponse<ImageGenerationPreview>> {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/drama/projects/${id}/characters/${characterId}/prepare-character-sheet`,
    provider ? { provider } : {},
  );
  return data;
}

export async function generateDramaCharacterSheet(
  id: string,
  characterId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
) {
  const { data } = await apiClient.post<ApiResponse<DramaCharacterPortraitData>>(
    `/drama/projects/${id}/characters/${characterId}/generate-character-sheet`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return data;
}
