import type { StoryAssetStateImage } from "@ai-novel/shared/types/novelReferenceExtraction";

export interface StoryAssetImageArtifactCandidate {
  id: string;
}

function hasReadablePointer(image: StoryAssetStateImage | undefined): boolean {
  return Boolean(image?.artifactId?.trim() || image?.url?.trim());
}

/**
 * 生成失败只记录本次失败，不得把 staging 制品或失败请求的 URL 变成当前图片。
 * 当前状态已有可读指针时，只从当前状态恢复指针字段；没有旧图时则清掉
 * attempted 上可能携带的临时指针，避免把未提交制品暴露成当前图片。
 */
export function preserveReadableStoryAssetImagePointer(
  current: StoryAssetStateImage | undefined,
  attempted: StoryAssetStateImage,
): StoryAssetStateImage {
  if (attempted.status !== "error") {
    return attempted;
  }

  const {
    artifactId: _attemptedArtifactId,
    url: _attemptedUrl,
    generatedAt: _attemptedGeneratedAt,
    ...failure
  } = attempted;
  if (!hasReadablePointer(current)) {
    return failure;
  }

  return {
    ...failure,
    ...(current?.artifactId?.trim() ? { artifactId: current.artifactId } : {}),
    ...(current?.url?.trim() ? { url: current.url } : {}),
    ...(current?.generatedAt?.trim() ? { generatedAt: current.generatedAt } : {}),
  };
}

/**
 * 当前制品损坏时，先尝试当前指针，再尝试同一所有权范围内的历史制品。
 * 数据库调用方负责先按 updatedAt/createdAt 排成最新优先；这里不重新排序，
 * 只把当前指针提升到第一位，避免恢复时误取其它资产的同名状态。
 */
export function prioritizeStoryAssetImageArtifacts<T extends StoryAssetImageArtifactCandidate>(
  currentArtifactId: string | null | undefined,
  candidates: readonly T[],
): T[] {
  const currentId = currentArtifactId?.trim();
  if (!currentId) {
    return [...candidates];
  }
  const current = candidates.find((candidate) => candidate.id === currentId);
  if (!current) {
    return [...candidates];
  }
  return [current, ...candidates.filter((candidate) => candidate.id !== currentId)];
}

/**
 * 关闭状态图失败提示时只清除错误文案。
 *
 * 状态图的 status 描述最近一次生成尝试，图片指针描述当前仍可读取的制品；
 * 两者不能因为用户关闭提示而被互相覆盖。保留 error status 也让用户仍可重新生成，
 * 而删除 error 字段后详情页和资产卡片不再展示红色失败提示。
 */
export function dismissStoryAssetImageError(
  image: StoryAssetStateImage,
  expectedError?: string,
  expectedAttemptId?: string,
): StoryAssetStateImage {
  if (!image.error?.trim()
    || (expectedError !== undefined && image.error !== expectedError)
    || (expectedAttemptId !== undefined && image.attemptId !== expectedAttemptId)) {
    return image;
  }
  const { error: _error, ...withoutError } = image;
  return withoutError;
}
