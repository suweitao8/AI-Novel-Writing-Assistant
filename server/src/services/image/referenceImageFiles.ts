import fs from "fs/promises";
import os from "os";
import path from "path";

import { fingerprintImageFile } from "./runtime/referenceIntegrity";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface PreparedReferenceImageFiles {
  filePaths: string[];
  fingerprints: string[];
  cleanup: () => Promise<void>;
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return SUPPORTED_MIME_TYPES.has(mimeType) ? mimeType : null;
}

function sniffMimeType(bytes: Buffer): string | null {
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

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function resolveInternalReferenceUrl(source: string): string {
  const configuredBase = process.env.IMAGE_REFERENCE_BASE_URL?.trim();
  const port = Number(process.env.PORT ?? 3000);
  const safePort = Number.isInteger(port) && port > 0 ? port : 3000;
  const base = configuredBase || `http://127.0.0.1:${safePort}`;
  return new URL(source, base.endsWith("/") ? base : `${base}/`).toString();
}

function parseDataUrl(source: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(source);
  if (!match) {
    throw new Error("参考图 data URL 格式无效。");
  }
  const declaredMime = normalizeMimeType(match[1]);
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  const mimeType = sniffMimeType(bytes) ?? declaredMime;
  if (!mimeType || bytes.length === 0) {
    throw new Error("参考图 data URL 不是可读取的 PNG/JPEG/WebP 图片。");
  }
  return { bytes, mimeType };
}

async function downloadReferenceImage(source: string, signal?: AbortSignal): Promise<{ bytes: Buffer; mimeType: string }> {
  if (signal?.aborted) {
    throw new Error("参考图准备已取消。");
  }
  const requestUrl = source.startsWith("/") ? resolveInternalReferenceUrl(source) : source;
  let response: Response;
  try {
    response = await fetch(requestUrl, { signal });
  } catch (error) {
    throw new Error(`参考图无法读取（${source}）：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`参考图无法读取（${source}）：HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = sniffMimeType(bytes) ?? normalizeMimeType(response.headers.get("content-type"));
  if (!mimeType || bytes.length === 0) {
    throw new Error(`参考图无法读取（${source}）：响应不是 PNG/JPEG/WebP 图片。`);
  }
  return { bytes, mimeType };
}

async function writeDownloadedReference(
  tempDir: string,
  index: number,
  source: string,
  signal?: AbortSignal,
): Promise<string> {
  const { bytes, mimeType } = source.startsWith("data:")
    ? parseDataUrl(source)
    : await downloadReferenceImage(source, signal);
  const filePath = path.join(tempDir, `reference-${index + 1}.${extensionForMimeType(mimeType)}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

/**
 * 将生图入口的参考图统一准备成有序本地文件。
 * Provider 只需要处理文件上传，不需要理解资产 URL、API 路由或 data URL。
 */
export async function prepareReferenceImageFiles(input: {
  refImagePaths?: readonly string[];
  refImages?: readonly string[];
  signal?: AbortSignal;
}): Promise<PreparedReferenceImageFiles> {
  const localPaths = (input.refImagePaths ?? []).map((item) => item.trim()).filter(Boolean);
  const imageUrls = (input.refImages ?? []).map((item) => item.trim()).filter(Boolean);
  const temporaryPaths: string[] = [];
  let tempDir: string | null = null;
  let cleaned = false;

  try {
    for (let index = 0; index < localPaths.length; index += 1) {
      const filePath = localPaths[index];
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`参考图文件无法读取（第${index + 1}张）：${filePath}`);
      }
      temporaryPaths.push(filePath);
    }

    if (imageUrls.length > 0) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-novel-image-reference-"));
      for (let index = 0; index < imageUrls.length; index += 1) {
        const filePath = await writeDownloadedReference(tempDir, localPaths.length + index, imageUrls[index], input.signal);
        temporaryPaths.push(filePath);
      }
    }

    return {
      filePaths: temporaryPaths,
      fingerprints: await Promise.all(temporaryPaths.map((filePath) => fingerprintImageFile(filePath))),
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }
}
