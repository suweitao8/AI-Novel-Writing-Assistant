import fs from "fs/promises";
import os from "os";
import path from "path";

import { fingerprintImageFile } from "./runtime/referenceIntegrity";
import { normalizeImageMimeType, sniffImageMimeType } from "./imageMimeType";

export interface PreparedReferenceImageFiles {
  filePaths: string[];
  fingerprints: string[];
  cleanup: () => Promise<void>;
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
  const declaredMime = normalizeImageMimeType(match[1]);
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  const mimeType = sniffImageMimeType(bytes) ?? declaredMime;
  if (!mimeType || bytes.length === 0) {
    throw new Error("参考图 data URL 不是可读取的 PNG/JPEG/WebP 图片。");
  }
  return { bytes, mimeType };
}

const MAX_REFERENCE_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** 参考图下载只允许 http(s)；除本服务自身外，拒绝环回与私网地址，避免被当作内网探测入口。 */
function assertFetchableReferenceUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`参考图 URL 无效（${rawUrl}）。`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`参考图仅支持 http/https 地址（${rawUrl}）。`);
  }
  const ownOrigin = new URL(resolveInternalReferenceUrl("/"));
  if (url.origin === ownOrigin.origin) {
    return;
  }
  if (isPrivateOrLoopbackHost(url.hostname)) {
    throw new Error(`参考图不允许指向本机或内网地址（${url.hostname}）。`);
  }
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return true;
  }
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const nums = parts.map(Number);
    if (nums.some((n) => n < 0 || n > 255)) {
      return false;
    }
    const [a, b] = nums;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  return false;
}

async function downloadReferenceImage(source: string, signal?: AbortSignal): Promise<{ bytes: Buffer; mimeType: string }> {
  if (signal?.aborted) {
    throw new Error("参考图准备已取消。");
  }
  const requestUrl = source.startsWith("/") ? resolveInternalReferenceUrl(source) : source;
  assertFetchableReferenceUrl(requestUrl);
  let response: Response;
  try {
    response = await fetch(requestUrl, { signal });
  } catch (error) {
    throw new Error(`参考图无法读取（${source}）：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`参考图无法读取（${source}）：HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REFERENCE_DOWNLOAD_BYTES) {
    throw new Error(`参考图无法读取（${source}）：超过 ${Math.round(MAX_REFERENCE_DOWNLOAD_BYTES / (1024 * 1024))} MB 上限。`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buffer = Buffer.from(value);
      total += buffer.length;
      if (total > MAX_REFERENCE_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error(`参考图无法读取（${source}）：超过 ${Math.round(MAX_REFERENCE_DOWNLOAD_BYTES / (1024 * 1024))} MB 上限。`);
      }
      chunks.push(buffer);
    }
  }
  const bytes = Buffer.concat(chunks);
  const mimeType = sniffImageMimeType(bytes) ?? normalizeImageMimeType(response.headers.get("content-type"));
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
