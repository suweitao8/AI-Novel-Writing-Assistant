/**
 * 图片魔数嗅探的唯一实现：上传与参考图下载都据此判定真实文件类型，
 * 不信任客户端声明的 Content-Type。
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isSupportedImageMimeType(mimeType: string | null | undefined): mimeType is "image/png" | "image/jpeg" | "image/webp" {
  return typeof mimeType === "string" && SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
}

export function normalizeImageMimeType(mimeType: string | null | undefined): string | null {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  return isSupportedImageMimeType(normalized) ? normalized : null;
}

export function sniffImageMimeType(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
