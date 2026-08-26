import type { Request } from "express";
import { AppError } from "./errorHandler";

export const DEFAULT_MAX_RAW_BODY_BYTES = 12 * 1024 * 1024;

/**
 * 读取未过 body 解析器的原始请求体（图片直传等），在读流中即时限制
 * 大小，避免绕过 express.json limit 的端点被单个请求耗尽内存。
 */
export async function readBoundedRawBody(req: Request, maxBytes = DEFAULT_MAX_RAW_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > maxBytes) {
      throw new AppError(`上传内容超过大小上限 ${Math.round(maxBytes / (1024 * 1024))} MB。`, 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
