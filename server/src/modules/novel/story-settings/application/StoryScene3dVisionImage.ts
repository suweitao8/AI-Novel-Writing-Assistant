import sharp from "sharp";

const ANALYSIS_IMAGE_MAX_EDGE = 2048;

/**
 * 视觉分析统一使用可控大小的预览图，避免把原始全景 PNG 的体积直接带进模型请求。
 * 解码或压缩失败时保留原图，让模型通道返回真实的格式错误。
 */
export async function prepareStoryScene3dVisionImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ imageBase64: string; mimeType: string }> {
  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (longestEdge > ANALYSIS_IMAGE_MAX_EDGE) {
      const compressed = await image
        .resize({ width: ANALYSIS_IMAGE_MAX_EDGE, height: ANALYSIS_IMAGE_MAX_EDGE, fit: "inside" })
        .jpeg({ quality: 82 })
        .toBuffer();
      if (compressed.byteLength > 0 && compressed.byteLength < buffer.byteLength) {
        return { imageBase64: compressed.toString("base64"), mimeType: "image/jpeg" };
      }
    }
  } catch {
    // 解码失败时按原图继续，让后续结构化调用暴露真正的格式问题。
  }
  return { imageBase64: buffer.toString("base64"), mimeType };
}
