import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { resolveGeneratedImagesRoot } from "../../../../runtime/appPaths";
import type { StoryAssetKind } from "./StoryAssetStateImageStorage";

const STATE_IMAGES_DIR = "story-state-images";
const IMAGE_FILE_BASE = "image";

export type StoryAssetImageExtension = "png" | "jpg" | "jpeg" | "webp";
export type StoryAssetImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface StoryAssetImageArtifactTarget {
  novelId: string;
  kind: StoryAssetKind;
  assetId: string;
  stateId: string;
  generationId: string;
  extension: StoryAssetImageExtension;
}

export interface StoryAssetImageArtifactWriteInput extends StoryAssetImageArtifactTarget {
  bytes: Buffer | Uint8Array;
  mimeType: StoryAssetImageMimeType;
}

export interface StoryAssetImageArtifactLocation extends StoryAssetImageArtifactTarget {
  storageKey: string;
  finalPath: string;
  tempPath: string;
}

export interface StoryAssetImageArtifactMetadata extends StoryAssetImageArtifactLocation {
  mimeType: StoryAssetImageMimeType;
  sha256: string;
  byteSize: number;
}

export interface StoryAssetImageArtifactVerificationInput {
  storageKey: string;
  finalPath: string;
  sha256?: string | null;
  byteSize?: number | null;
  mimeType?: StoryAssetImageMimeType | null;
  extension?: StoryAssetImageExtension | null;
}

export type StoryAssetImageArtifactVerification =
  | {
      exists: true;
      valid: true;
      storageKey: string;
      finalPath: string;
      sha256: string;
      byteSize: number;
      mimeType: StoryAssetImageMimeType;
      extension: StoryAssetImageExtension;
    }
  | {
      exists: boolean;
      valid: false;
      storageKey: string;
      finalPath: string;
      reason: "missing" | "metadata_mismatch" | "unsupported_type";
      sha256?: string;
      byteSize?: number;
      mimeType?: StoryAssetImageMimeType;
      extension?: StoryAssetImageExtension;
    };

export interface StoryAssetImageArtifactStoreOptions {
  rootDir?: string;
}

function storageSegment(value: string): string {
  return `id-${encodeURIComponent(value.trim() || "_")}`;
}

function normalizeExtension(extension: string): StoryAssetImageExtension {
  const normalized = extension.trim().toLowerCase();
  if (normalized === "png" || normalized === "jpg" || normalized === "jpeg" || normalized === "webp") {
    return normalized;
  }
  throw new Error(`Unsupported story asset image extension: ${extension}`);
}

function expectedMimeForExtension(extension: StoryAssetImageExtension): StoryAssetImageMimeType {
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function sniffMimeType(bytes: Buffer): StoryAssetImageMimeType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
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

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function toStoragePath(storageKey: string): string[] {
  return storageKey.split("/");
}

export function buildStoryAssetImageArtifactStorageKey(input: StoryAssetImageArtifactTarget): string {
  const extension = normalizeExtension(input.extension);
  return [
    STATE_IMAGES_DIR,
    storageSegment(input.novelId),
    input.kind,
    storageSegment(input.assetId),
    storageSegment(input.stateId),
    "generations",
    storageSegment(input.generationId),
    `${IMAGE_FILE_BASE}.${extension}`,
  ].join("/");
}

/**
 * 数据库里的 storageKey 不是可信的归属证明；读取前必须确认它正好指向
 * 当前 novel/kind/asset/state/generation 的不可变图片，而不是其它资产目录或裸 stateId 目录。
 */
export function isStoryAssetImageArtifactStorageKeyForTarget(
  storageKey: string,
  target: StoryAssetImageArtifactTarget,
): boolean {
  try {
    return storageKey === buildStoryAssetImageArtifactStorageKey(target);
  } catch {
    return false;
  }
}

export class StoryAssetImageArtifactStore {
  private readonly rootDir: string;

  constructor(options: StoryAssetImageArtifactStoreOptions = {}) {
    this.rootDir = options.rootDir ?? resolveGeneratedImagesRoot();
  }

  buildLocation(input: StoryAssetImageArtifactTarget): StoryAssetImageArtifactLocation {
    const extension = normalizeExtension(input.extension);
    const normalizedInput = { ...input, extension };
    const storageKey = buildStoryAssetImageArtifactStorageKey(normalizedInput);
    const finalPath = path.join(this.rootDir, ...toStoragePath(storageKey));
    return {
      ...normalizedInput,
      storageKey,
      finalPath,
      tempPath: `${finalPath}.part`,
    };
  }

  async writePartFile(location: StoryAssetImageArtifactLocation, bytes: Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(location.tempPath), { recursive: true });
    const handle = await fs.open(location.tempPath, "wx");
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }

  async writeArtifactBytes(input: StoryAssetImageArtifactWriteInput): Promise<StoryAssetImageArtifactMetadata> {
    const extension = normalizeExtension(input.extension);
    const expectedMime = expectedMimeForExtension(extension);
    if (input.mimeType !== expectedMime) {
      throw new Error(`MIME ${input.mimeType} does not match extension ${extension}`);
    }

    const bytes = Buffer.from(input.bytes);
    const detectedMime = sniffMimeType(bytes);
    if (detectedMime !== input.mimeType) {
      throw new Error(`Image bytes do not match MIME ${input.mimeType}`);
    }

    const location = this.buildLocation({ ...input, extension });
    if (await exists(location.finalPath)) {
      throw new Error(`Story asset image artifact already exists: ${location.storageKey}`);
    }

    await this.writePartFile(location, bytes);
    return this.finalizePartFile(location, input.mimeType);
  }

  /** 完成 runtime 已写入的 `.part` 文件；final 文件只通过同盘 rename 暴露。 */
  async finalizePartFile(
    location: StoryAssetImageArtifactLocation,
    mimeType: StoryAssetImageMimeType,
  ): Promise<StoryAssetImageArtifactMetadata> {
    const extension = normalizeExtension(location.extension);
    const expectedMime = expectedMimeForExtension(extension);
    if (mimeType !== expectedMime) {
      throw new Error(`MIME ${mimeType} does not match extension ${extension}`);
    }

    const bytes = await fs.readFile(location.tempPath);
    if (await exists(location.finalPath)) {
      throw new Error(`Story asset image artifact already exists: ${location.storageKey}`);
    }
    const metadata = {
      ...location,
      mimeType,
      sha256: sha256(bytes),
      byteSize: bytes.length,
    };

    const detectedMime = sniffMimeType(bytes);
    if (detectedMime !== mimeType) {
      throw new Error(`Image bytes do not match MIME ${mimeType}`);
    }

    if (path.dirname(location.tempPath) !== path.dirname(location.finalPath)) {
      throw new Error(`Story asset image artifact temp and final paths are not on the same directory: ${location.storageKey}`);
    }

    await fs.rename(location.tempPath, location.finalPath);
    const verified = await this.verifyCurrentArtifact(metadata);
    if (!verified.valid) {
      throw new Error(`Story asset image artifact verification failed after commit: ${location.storageKey}`);
    }

    return metadata;
  }

  resolveStorageKeyPath(storageKey: string): string {
    const root = path.resolve(this.rootDir);
    const candidate = path.resolve(root, ...storageKey.split("/").filter(Boolean));
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      throw new Error("Story asset image storage key escapes the generated image root");
    }
    return candidate;
  }

  async verifyCurrentArtifact(input: StoryAssetImageArtifactVerificationInput): Promise<StoryAssetImageArtifactVerification> {
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(input.finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          exists: false,
          valid: false,
          storageKey: input.storageKey,
          finalPath: input.finalPath,
          reason: "missing",
        };
      }
      throw error;
    }

    const extension = input.extension ? normalizeExtension(input.extension) : extensionFromPath(input.finalPath);
    const mimeType = sniffMimeType(bytes);
    if (!extension || !mimeType) {
      return {
        exists: true,
        valid: false,
        storageKey: input.storageKey,
        finalPath: input.finalPath,
        reason: "unsupported_type",
      };
    }

    const actualSha256 = sha256(bytes);
    const actualByteSize = bytes.length;
    const expectedMime = expectedMimeForExtension(extension);
    const matches = mimeType === expectedMime
      && (!input.mimeType || input.mimeType === mimeType)
      && (!input.sha256 || input.sha256 === actualSha256)
      && (input.byteSize == null || input.byteSize === actualByteSize);

    if (!matches) {
      return {
        exists: true,
        valid: false,
        storageKey: input.storageKey,
        finalPath: input.finalPath,
        reason: "metadata_mismatch",
        sha256: actualSha256,
        byteSize: actualByteSize,
        mimeType,
        extension,
      };
    }

    return {
      exists: true,
      valid: true,
      storageKey: input.storageKey,
      finalPath: input.finalPath,
      sha256: actualSha256,
      byteSize: actualByteSize,
      mimeType,
      extension,
    };
  }
}

function extensionFromPath(filePath: string): StoryAssetImageExtension | null {
  try {
    return normalizeExtension(path.extname(filePath).replace(/^\./, ""));
  } catch {
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
