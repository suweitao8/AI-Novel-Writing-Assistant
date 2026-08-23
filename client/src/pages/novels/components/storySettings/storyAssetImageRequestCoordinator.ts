import {
  generateStoryAssetStateImage,
  type StoryAssetKind,
} from "@/api/story/storySettings";
import {
  StoryAssetImageRequestRegistry,
  type StoryAssetImageRequestState,
} from "./storyAssetImageRequestRegistry";

export interface StoryAssetImageRequest {
  novelId: string;
  kind: StoryAssetKind;
  assetId: string;
  stateId: string;
}

type StoryAssetImageResponse = Awaited<ReturnType<typeof generateStoryAssetStateImage>>;

const requests = new StoryAssetImageRequestRegistry<StoryAssetImageResponse>();

function getRequestKey(request: StoryAssetImageRequest): string {
  return `${request.novelId}:${request.kind}:${request.assetId}:${request.stateId}`;
}

async function execute(request: StoryAssetImageRequest): Promise<StoryAssetImageResponse> {
  const response = await generateStoryAssetStateImage(
    request.novelId,
    request.kind,
    request.assetId,
    request.stateId,
  );
  if (!response.data) {
    throw new Error(response.error ?? response.message ?? "图片生成失败，请打开资产详情重试。");
  }
  return response;
}

export function reserveStoryAssetImageRequest(request: StoryAssetImageRequest): void {
  requests.reserve(getRequestKey(request));
}

export function startStoryAssetImageRequest(request: StoryAssetImageRequest): Promise<StoryAssetImageResponse> {
  const key = getRequestKey(request);
  return requests.start(key, () => execute(request));
}

export function requestStoryAssetImage(request: StoryAssetImageRequest): Promise<StoryAssetImageResponse> {
  const key = getRequestKey(request);
  return requests.request(key, () => execute(request));
}

export function getStoryAssetImageRequestState(
  request: StoryAssetImageRequest,
): StoryAssetImageRequestState | null {
  return requests.getState(getRequestKey(request));
}
