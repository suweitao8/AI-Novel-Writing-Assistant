import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import {
  synthesizeAudioSpeech,
  type AudioSpeechInput,
  type AudioSpeechResult,
} from "../audio/speechProvider";

export const GLOBAL_NARRATOR_VOICE_SETTING_KEY = "drama.globalNarratorVoice";
export const GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT = "这是当前音色的试听效果，一句话就能听出年龄、语气和节奏。";

export type GlobalNarratorVoiceSource = "legacy" | "generated" | "manual";

export interface GlobalNarratorVoiceState {
  description?: string;
  sampleAudioUrl?: string;
  sampleText?: string;
  sampleSha256?: string;
  source?: GlobalNarratorVoiceSource;
  updatedAt?: string;
}

interface AppSettingStore {
  findUnique(args: { where: { key: string } }): Promise<{ key: string; value: string } | null>;
  upsert(args: {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  }): Promise<unknown>;
}

interface LegacyProjectStore {
  findFirst(args: {
    where: { narratorVoiceData: { not: null } };
    orderBy: { updatedAt: "asc" };
    select: { narratorVoiceData: true };
  }): Promise<{ narratorVoiceData: string | null } | null>;
}

interface GlobalNarratorVoiceSettingsServiceDeps {
  appSettingStore?: AppSettingStore;
  legacyProjectStore?: LegacyProjectStore;
  synthesize?: (input: AudioSpeechInput) => Promise<Pick<AudioSpeechResult, "dataUrl">>;
  now?: () => Date;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readSource(value: unknown): GlobalNarratorVoiceSource | undefined {
  return value === "legacy" || value === "generated" || value === "manual" ? value : undefined;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseGlobalNarratorVoice(value: unknown): GlobalNarratorVoiceState {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  const state: GlobalNarratorVoiceState = {};
  const description = readString(record.description);
  const sampleAudioUrl = readString(record.sampleAudioUrl);
  const sampleText = readString(record.sampleText);
  const sampleSha256 = readString(record.sampleSha256);
  const source = readSource(record.source);
  const updatedAt = readString(record.updatedAt);
  if (description) state.description = description;
  if (sampleAudioUrl) state.sampleAudioUrl = sampleAudioUrl;
  if (sampleText) state.sampleText = sampleText;
  if (sampleSha256) state.sampleSha256 = sampleSha256;
  if (source) state.source = source;
  if (updatedAt) state.updatedAt = updatedAt;
  return state;
}

export function hasGlobalNarratorVoice(state: GlobalNarratorVoiceState): boolean {
  return Boolean(state.description || state.sampleAudioUrl);
}

export function hashNarratorSample(sampleAudioUrl: string): string {
  const dataUrlMatch = /^data:[^;,]+;base64,(.*)$/s.exec(sampleAudioUrl.trim());
  const bytes = dataUrlMatch ? Buffer.from(dataUrlMatch[1] ?? "", "base64") : sampleAudioUrl;
  return createHash("sha256").update(bytes).digest("hex");
}

export class GlobalNarratorVoiceSettingsService {
  constructor(private readonly deps: GlobalNarratorVoiceSettingsServiceDeps = {}) {}

  async get(): Promise<GlobalNarratorVoiceState> {
    const currentRecord = await this.getAppSettingStore().findUnique({
      where: { key: GLOBAL_NARRATOR_VOICE_SETTING_KEY },
    });
    const current = parseGlobalNarratorVoice(currentRecord?.value);
    if (hasGlobalNarratorVoice(current)) {
      return current;
    }

    const legacy = await this.getLegacyProjectStore().findFirst({
      where: { narratorVoiceData: { not: null } },
      orderBy: { updatedAt: "asc" },
      select: { narratorVoiceData: true },
    });
    const migrated = parseGlobalNarratorVoice(legacy?.narratorVoiceData);
    if (!hasGlobalNarratorVoice(migrated)) {
      return current;
    }

    const next: GlobalNarratorVoiceState = {
      ...migrated,
      source: migrated.source ?? "legacy",
      updatedAt: migrated.updatedAt ?? this.getNow().toISOString(),
      ...(migrated.sampleAudioUrl && !migrated.sampleSha256
        ? { sampleSha256: hashNarratorSample(migrated.sampleAudioUrl) }
        : {}),
    };
    await this.save(next);
    return next;
  }

  async updateDescription(description: string): Promise<GlobalNarratorVoiceState> {
    const trimmed = description.trim();
    this.assertDescription(trimmed);
    const current = await this.get();
    const next: GlobalNarratorVoiceState = {
      ...current,
      description: trimmed,
      source: "manual",
      updatedAt: this.getNow().toISOString(),
    };
    await this.save(next);
    return next;
  }

  async design(description: string): Promise<GlobalNarratorVoiceState> {
    const trimmed = description.trim();
    this.assertDescription(trimmed);
    const result = await this.getSynthesizer()({
      text: GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT,
      audioType: "narration",
      emotion: trimmed,
    });
    const next: GlobalNarratorVoiceState = {
      description: trimmed,
      sampleAudioUrl: result.dataUrl,
      sampleText: GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT,
      sampleSha256: hashNarratorSample(result.dataUrl),
      source: "generated",
      updatedAt: this.getNow().toISOString(),
    };
    await this.save(next);
    return next;
  }

  private async save(state: GlobalNarratorVoiceState): Promise<void> {
    const value = JSON.stringify(state);
    await this.getAppSettingStore().upsert({
      where: { key: GLOBAL_NARRATOR_VOICE_SETTING_KEY },
      update: { value },
      create: { key: GLOBAL_NARRATOR_VOICE_SETTING_KEY, value },
    });
  }

  private assertDescription(description: string): void {
    if (description.length < 4) {
      throw new AppError("旁白音色描述太短了：写清年龄、性别与叙述风格（例如「成年男声旁白，普通话自然，平直叙述」）。", 400);
    }
    if (description.length > 1000) {
      throw new AppError("旁白音色描述不能超过 1000 个字符。", 400);
    }
  }

  private getAppSettingStore(): AppSettingStore {
    return (this.deps.appSettingStore ?? prisma.appSetting) as unknown as AppSettingStore;
  }

  private getLegacyProjectStore(): LegacyProjectStore {
    return (this.deps.legacyProjectStore ?? prisma.dramaProject) as unknown as LegacyProjectStore;
  }

  private getSynthesizer(): (input: AudioSpeechInput) => Promise<Pick<AudioSpeechResult, "dataUrl">> {
    return this.deps.synthesize ?? synthesizeAudioSpeech;
  }

  private getNow(): Date {
    return this.deps.now?.() ?? new Date();
  }
}

export const globalNarratorVoiceSettingsService = new GlobalNarratorVoiceSettingsService();
