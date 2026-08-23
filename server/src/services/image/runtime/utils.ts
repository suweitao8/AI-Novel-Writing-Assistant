/**
 * 图像生成 runtime 工具函数（单一来源）
 *
 * 替代散落在 4 个 comic service + 2 个 drama service 中的同名重复实现。
 */
import fs from "fs/promises";
import path from "path";

/** 安全 JSON 解析（解析失败返回 fallback） */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 从资产表的状态 JSON 里取出列表/详情要用的精简图片状态（没生成过为 null）。 */
export function parseImageStateSummary(value: string | null | undefined): { status: string; url?: string } | null {
  if (!value?.trim()) return null;
  const parsed = safeJsonParse<{ status?: string; url?: string }>(value, { status: "idle" });
  return { status: parsed.status ?? "idle", ...(parsed.url ? { url: parsed.url } : {}) };
}

/** 取图片字节（data: 或 http(s):）——落盘前的统一出口，便于透明底抠底等后处理。 */
export async function resolveImageBytes(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const [, b64 = ""] = imageUrl.split(",", 2);
    return Buffer.from(b64, "base64");
  }
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`图片下载失败 (${resp.status}): ${imageUrl}`);
  return Buffer.from(await resp.arrayBuffer());
}

/** 把图片字节写到磁盘（自动建目录）；制品临时文件使用独占创建，旧适配器仍可覆盖固定路径。 */
export async function writeImageBytes(
  destPath: string,
  bytes: Buffer,
  options: { exclusive?: boolean } = {},
): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  if (options.exclusive) {
    await fs.writeFile(destPath, bytes, { flag: "wx" });
    return;
  }
  await fs.writeFile(destPath, bytes);
}

/** 把图片 URL（data: 或 http(s):）保存到本地磁盘 */
export async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await writeImageBytes(destPath, await resolveImageBytes(imageUrl));
}

/** 根据 URL 推断扩展名（png/jpg/webp）；无法识别时默认 png */
export function inferExtension(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/jpeg")) return "jpg";
  if (imageUrl.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch {
    return "png";
  }
}

/** 标准化错误信息为字符串 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
