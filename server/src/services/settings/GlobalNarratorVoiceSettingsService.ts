import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import {
  selectVoxCPMReferenceAudio,
  synthesizeAudioSpeech,
  type AudioSpeechInput,
  type AudioSpeechResult,
} from "../audio/speechProvider";
import { VOICE_PREVIEW_SAMPLE_TEXT } from "../audio/voicePreviewSample";

export const GLOBAL_NARRATOR_VOICE_SETTING_KEY = "drama.globalNarratorVoice";
/** 兼容现有调用方；实际文本由 audio/voicePreviewSample 统一维护。 */
export const GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT = VOICE_PREVIEW_SAMPLE_TEXT;
export const DEFAULT_GLOBAL_NARRATOR_VOICE_DESCRIPTION =
  "成年女性，约30岁，明亮自然的女中音；普通话标准清晰，声音温暖亲和，像真实的人在近距离讲故事；语速中等，停顿自然，句尾平稳但有轻微语气变化；吐字清楚、连贯，有真实呼吸感；不要播音腔、主持腔、新闻腔，不要低沉或男性化。";

export type GlobalNarratorVoiceSource = "legacy" | "generated" | "manual";

export interface GlobalNarratorVoiceState {
  description?: string;
  sampleAudioUrl?: string;
  /** IndexTTS 2.5 音色库中的稳定参考音频文件名。 */
  referenceAudioUrl?: string;
  /** IndexTTS 2.5 的已训练 speaker 名称。 */
  indexTTS25Speaker?: string;
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
  findMany(args: {
    where: { narratorVoiceData: { not: null } };
    orderBy: { updatedAt: "asc" };
    select: { narratorVoiceData: true };
  }): Promise<Array<{ narratorVoiceData: string | null }>>;
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
  const referenceAudioUrl = readString(record.referenceAudioUrl);
  const indexTTS25Speaker = readString(record.indexTTS25Speaker);
  const sampleText = readString(record.sampleText);
  const sampleSha256 = readString(record.sampleSha256);
  const source = readSource(record.source);
  const updatedAt = readString(record.updatedAt);
  if (description) state.description = description;
  if (sampleAudioUrl) state.sampleAudioUrl = sampleAudioUrl;
  if (referenceAudioUrl) state.referenceAudioUrl = referenceAudioUrl;
  if (indexTTS25Speaker) state.indexTTS25Speaker = indexTTS25Speaker;
  if (sampleText) state.sampleText = sampleText;
  if (sampleSha256) state.sampleSha256 = sampleSha256;
  if (source) state.source = source;
  if (updatedAt) state.updatedAt = updatedAt;
  return state;
}

export function hasGlobalNarratorVoice(state: GlobalNarratorVoiceState): boolean {
  return Boolean(state.description || state.sampleAudioUrl);
}

/**
 * 旧版旁白可能把小说正文或短句写入 sampleText。
 * 文本与音频不一致时隐藏旧音频，保留描述供用户重新生成标准试听样本。
 */
function withoutIncompatibleNarratorSample(state: GlobalNarratorVoiceState): GlobalNarratorVoiceState {
  if (!state.sampleAudioUrl || state.sampleText === GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT) {
    return state;
  }
  const next = { ...state };
  delete next.sampleAudioUrl;
  delete next.referenceAudioUrl;
  delete next.sampleText;
  delete next.sampleSha256;
  return next;
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
    const current = withoutIncompatibleNarratorSample(parseGlobalNarratorVoice(currentRecord?.value));
    if (hasGlobalNarratorVoice(current)) {
      return current;
    }

    const legacyProjects = await this.getLegacyProjectStore().findMany({
      where: { narratorVoiceData: { not: null } },
      orderBy: { updatedAt: "asc" },
      select: { narratorVoiceData: true },
    });
    const migrated = legacyProjects
      .map((legacy) => withoutIncompatibleNarratorSample(parseGlobalNarratorVoice(legacy.narratorVoiceData)))
      .find(hasGlobalNarratorVoice) ?? {};
    if (!hasGlobalNarratorVoice(migrated)) {
      return { description: DEFAULT_GLOBAL_NARRATOR_VOICE_DESCRIPTION };
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

  async updateDescription(
    description: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<GlobalNarratorVoiceState> {
    const trimmed = description.trim();
    this.assertDescription(trimmed);
    const current = await this.get();
    const hasReferenceOverride = options.referenceAudioUrl !== undefined;
    const referenceCandidate = hasReferenceOverride
      ? options.referenceAudioUrl?.trim() || undefined
      : current.referenceAudioUrl;
    const referenceAudioUrl = selectVoxCPMReferenceAudio(referenceCandidate);
    const indexTTS25Speaker = options.indexTTS25Speaker?.trim() || current.indexTTS25Speaker;
    const next: GlobalNarratorVoiceState = {
      ...current,
      description: trimmed,
      ...(referenceAudioUrl ? { referenceAudioUrl } : {}),
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
      source: "manual",
      updatedAt: this.getNow().toISOString(),
    };
    if (hasReferenceOverride && !referenceAudioUrl) delete next.referenceAudioUrl;
    await this.save(next);
    return next;
  }

  async design(
    description: string,
    options: { referenceAudioUrl?: string | null; indexTTS25Speaker?: string } = {},
  ): Promise<GlobalNarratorVoiceState> {
    const trimmed = description.trim();
    this.assertDescription(trimmed);
    const current = await this.get();
    const hasReferenceOverride = options.referenceAudioUrl !== undefined;
    const referenceCandidate = hasReferenceOverride
      ? options.referenceAudioUrl?.trim() || undefined
      : current.referenceAudioUrl;
    const persistedReferenceAudioUrl = selectVoxCPMReferenceAudio(referenceCandidate);
    // 音色设计和音色克隆是两条不同路径：没有用户明确提供的参考音频时，
    // 必须让 VoxCPM2 从描述重新设计新音色，不能把上一次试听样本当作隐式参考。
    // 否则用户把“男声”改成“女声”时，模型仍会优先复制旧样本的音色。
    const referenceAudioUrl = persistedReferenceAudioUrl;
    const indexTTS25Speaker = options.indexTTS25Speaker?.trim() || current.indexTTS25Speaker;
    const result = await this.getSynthesizer()({
      text: GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT,
      audioType: "narration",
      emotion: trimmed,
      referenceAudioUrl,
    });
    const next: GlobalNarratorVoiceState = {
      ...current,
      description: trimmed,
      sampleAudioUrl: result.dataUrl,
      ...(indexTTS25Speaker ? { indexTTS25Speaker } : {}),
      sampleText: GLOBAL_NARRATOR_VOICE_SAMPLE_TEXT,
      sampleSha256: hashNarratorSample(result.dataUrl),
      source: "generated",
      updatedAt: this.getNow().toISOString(),
    };
    if (referenceAudioUrl) {
      next.referenceAudioUrl = referenceAudioUrl;
    } else {
      delete next.referenceAudioUrl;
    }
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
