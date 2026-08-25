import { createHash } from "node:crypto";
import fs from "node:fs/promises";

/**
 * 图片结果完整性指纹。
 *
 * 这里故意只判断字节级完全相同：它可以识别 provider 把附件原样返回的
 * 情况，但不会把视觉上相似、实际已经重新生成的合法图片误判为失败。
 */
export function fingerprintImageBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function fingerprintImageFile(filePath: string): Promise<string> {
  return fingerprintImageBytes(await fs.readFile(filePath));
}

export function matchesReferenceImageFingerprint(
  bytes: Uint8Array,
  referenceFingerprints: readonly string[] | undefined,
): boolean {
  if (!referenceFingerprints || referenceFingerprints.length === 0) {
    return false;
  }
  return referenceFingerprints.includes(fingerprintImageBytes(bytes));
}
