import { createHash } from "node:crypto";

import {
  STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS,
  STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS,
  normalizeStoryAssetHeightMeters,
  parseStoryAssetStatesJson,
  type StoryAssetState,
} from "@ai-novel/shared/types/novelReferenceExtraction";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { getRegisteredPromptAsset } from "../../../prompting/registry";
import type { PromptAsset } from "../../../prompting/core/promptTypes";

export const CHARACTER_HEIGHT_DEFAULT_METERS = 1.8;
export const CHARACTER_HEIGHT_MIN_METERS = STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS;
export const CHARACTER_HEIGHT_MAX_METERS = STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS;
export const CHARACTER_PROXY_NATIVE_HEIGHT_METERS = 1.8287;

/** 身高估算结果合同与 novel.character.heightEstimate@v1 的结构化输出保持一致。 */
interface CharacterHeightEstimateResult {
  heightMeters: number;
  confidence: number;
  rationale: string;
}

const CHARACTER_HEIGHT_ESTIMATE_PROMPT_ID = "novel.character.heightEstimate";
const CHARACTER_HEIGHT_ESTIMATE_PROMPT_VERSION = "v1";

const CHARACTER_HEIGHT_PROFILE_SCHEMA_VERSION = 1;
const HEIGHT_PROFILE_SOURCES = ["ai", "fallback"] as const;

export type CharacterHeightProfileSource = typeof HEIGHT_PROFILE_SOURCES[number];

export interface CharacterHeightProfile {
  schemaVersion: 1;
  heightMeters: number;
  confidence: number;
  rationale: string;
  source: CharacterHeightProfileSource;
  inputFingerprint: string;
  generatedAt: string;
}

export interface CharacterHeightResolution {
  heightMeters: number;
  heightSource: CharacterHeightProfileSource | "manual" | "legacy";
  heightConfidence?: number;
}

export interface CharacterHeightInput {
  name?: string | null;
  role?: string | null;
  gender?: string | null;
  ageGroup?: string | null;
  physique?: string | null;
  appearance?: string | null;
  personality?: string | null;
  background?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
  relations?: string | null;
}

interface CharacterHeightSubject extends CharacterHeightInput {
  kind: "novel" | "drama";
  id: string;
  name: string;
  updatedAt: Date;
  heightProfileJson: string | null;
  statesJson?: string | null;
}

interface NovelCharacterHeightRow extends CharacterHeightSubject {
  kind: "novel";
  role: string;
  gender: string;
  statesJson: string | null;
  heightProfileJson: string | null;
}

interface DramaCharacterHeightRow extends CharacterHeightSubject {
  kind: "drama";
  archetype: string | null;
  persona: string | null;
  visualAnchor: string | null;
  speechStyle: string | null;
  relations: string | null;
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return null;
}

function normalizedName(value: string): string {
  return compactText(value).toLocaleLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function profileInput(input: CharacterHeightInput): Record<string, string> {
  return {
    name: compactText(input.name),
    role: compactText(input.role),
    gender: compactText(input.gender),
    ageGroup: compactText(input.ageGroup),
    physique: compactText(input.physique),
    appearance: compactText(input.appearance),
    personality: compactText(input.personality),
    background: compactText(input.background),
    attireStyle: compactText(input.attireStyle),
    facePrompt: compactText(input.facePrompt),
    archetype: compactText(input.archetype),
    persona: compactText(input.persona),
    visualAnchor: compactText(input.visualAnchor),
    relations: compactText(input.relations),
  };
}

export function buildCharacterHeightInputFingerprint(input: CharacterHeightInput): string {
  const payload = JSON.stringify(profileInput(input));
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

/**
 * 角色状态模型把年龄、外貌和图片提示词放在默认状态里；旧角色则可能仍只有角色级字段。
 * 身高推断必须使用同一份合并输入，否则提取应用后的关键资料不会进入 Prompt。
 */
export function buildNovelCharacterHeightInput(subject: {
  name?: string | null;
  role?: string | null;
  gender?: string | null;
  ageGroup?: string | null;
  physique?: string | null;
  appearance?: string | null;
  personality?: string | null;
  background?: string | null;
  attireStyle?: string | null;
  facePrompt?: string | null;
  statesJson?: string | null;
}): CharacterHeightInput {
  const defaultState = parseStoryAssetStatesJson(subject.statesJson).states[0];
  return {
    name: firstNonEmpty(subject.name),
    role: firstNonEmpty(subject.role),
    gender: firstNonEmpty(subject.gender),
    ageGroup: firstNonEmpty(subject.ageGroup, defaultState?.ageGroup),
    physique: firstNonEmpty(subject.physique),
    appearance: firstNonEmpty(subject.appearance, defaultState?.description),
    personality: firstNonEmpty(subject.personality),
    background: firstNonEmpty(subject.background),
    attireStyle: firstNonEmpty(subject.attireStyle),
    facePrompt: firstNonEmpty(subject.facePrompt, defaultState?.imagePrompt),
  };
}

export function parseCharacterHeightProfile(raw: string | null | undefined): CharacterHeightProfile | null {
  if (!raw?.trim()) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const heightMeters = toFiniteNumber(value.heightMeters);
    const confidence = toFiniteNumber(value.confidence);
    const rationale = compactText(value.rationale);
    const source = value.source;
    if (
      value.schemaVersion !== CHARACTER_HEIGHT_PROFILE_SCHEMA_VERSION
      || heightMeters === null
      || heightMeters < CHARACTER_HEIGHT_MIN_METERS
      || heightMeters > CHARACTER_HEIGHT_MAX_METERS
      || confidence === null
      || confidence < 0
      || confidence > 1
      || !rationale
      || !HEIGHT_PROFILE_SOURCES.includes(source as CharacterHeightProfileSource)
      || typeof value.inputFingerprint !== "string"
      || !value.inputFingerprint.trim()
      || typeof value.generatedAt !== "string"
      || !value.generatedAt.trim()
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      heightMeters,
      confidence,
      rationale,
      source: source as CharacterHeightProfileSource,
      inputFingerprint: value.inputFingerprint.trim(),
      generatedAt: value.generatedAt.trim(),
    };
  } catch {
    return null;
  }
}

export function createFallbackCharacterHeightProfile(inputFingerprint: string): CharacterHeightProfile {
  return {
    schemaVersion: 1,
    heightMeters: CHARACTER_HEIGHT_DEFAULT_METERS,
    confidence: 0,
    rationale: "AI 身高推断不可用，使用兼容比例基准。",
    source: "fallback",
    inputFingerprint,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 分镜实际使用的角色高度：当前状态的人工值优先于角色级 AI 档案，历史角色再回退到兼容基准。
 * 该函数保持纯逻辑，供 blocking 和契约测试复用，避免各入口各自实现优先级。
 */
export function resolveCharacterHeightForState(
  state: Pick<StoryAssetState, "heightMeters"> | null | undefined,
  profile: CharacterHeightProfile | null | undefined,
): CharacterHeightResolution {
  const manualHeight = normalizeStoryAssetHeightMeters(state?.heightMeters);
  if (manualHeight !== undefined) {
    return { heightMeters: manualHeight, heightSource: "manual" };
  }
  if (profile) {
    return {
      heightMeters: profile.heightMeters,
      heightSource: profile.source,
      heightConfidence: profile.confidence,
    };
  }
  return { heightMeters: CHARACTER_HEIGHT_DEFAULT_METERS, heightSource: "legacy" };
}

export function heightToProxyScale(heightMeters: number): number {
  const safeHeight = clamp(
    Number.isFinite(heightMeters) ? heightMeters : CHARACTER_HEIGHT_DEFAULT_METERS,
    CHARACTER_HEIGHT_MIN_METERS,
    CHARACTER_HEIGHT_MAX_METERS,
  );
  return safeHeight / CHARACTER_PROXY_NATIVE_HEIGHT_METERS;
}

function buildAiProfile(output: CharacterHeightEstimateResult, inputFingerprint: string): CharacterHeightProfile {
  return {
    schemaVersion: 1,
    heightMeters: clamp(output.heightMeters, CHARACTER_HEIGHT_MIN_METERS, CHARACTER_HEIGHT_MAX_METERS),
    confidence: clamp(output.confidence, 0, 1),
    rationale: compactText(output.rationale),
    source: "ai",
    inputFingerprint,
    generatedAt: new Date().toISOString(),
  };
}

function subjectKey(subject: CharacterHeightSubject): string {
  return `${subject.kind}:${subject.id}`;
}

function promptCharacterJson(subject: CharacterHeightInput): string {
  return JSON.stringify(profileInput(subject), null, 2);
}

async function persistProfile(subject: CharacterHeightSubject, profile: CharacterHeightProfile): Promise<CharacterHeightProfile> {
  const data = { heightProfileJson: JSON.stringify(profile) };
  const where = {
    id: subject.id,
    updatedAt: subject.updatedAt,
    heightProfileJson: subject.heightProfileJson,
  };
  const result = subject.kind === "novel"
    ? await prisma.character.updateMany({ where, data })
    : await prisma.dramaCharacter.updateMany({ where, data });
  if (result.count === 1) return profile;

  const current = subject.kind === "novel"
    ? await prisma.character.findUnique({ where: { id: subject.id }, select: { heightProfileJson: true } })
    : await prisma.dramaCharacter.findUnique({ where: { id: subject.id }, select: { heightProfileJson: true } });
  return parseCharacterHeightProfile(current?.heightProfileJson) ?? profile;
}

async function ensureSubject(subject: CharacterHeightSubject): Promise<CharacterHeightProfile> {
  const heightInput = subject.kind === "novel"
    ? buildNovelCharacterHeightInput(subject)
    : subject;
  const inputFingerprint = buildCharacterHeightInputFingerprint(heightInput);
  const current = parseCharacterHeightProfile(subject.heightProfileJson);
  if (current?.inputFingerprint === inputFingerprint) return current;

  const heightEstimateAsset = getRegisteredPromptAsset(
    CHARACTER_HEIGHT_ESTIMATE_PROMPT_ID,
    CHARACTER_HEIGHT_ESTIMATE_PROMPT_VERSION,
  ) as PromptAsset<{ characterJson: string }, CharacterHeightEstimateResult> | null;
  if (!heightEstimateAsset) {
    throw new Error(
      `身高估算 Prompt 未注册：${CHARACTER_HEIGHT_ESTIMATE_PROMPT_ID}@${CHARACTER_HEIGHT_ESTIMATE_PROMPT_VERSION}`,
    );
  }

  let profile: CharacterHeightProfile;
  try {
    const result = await runStructuredPrompt({
      asset: heightEstimateAsset,
      promptInput: { characterJson: promptCharacterJson(heightInput) },
      options: {
        temperature: 0,
        entrypoint: "drama.blocking.characterHeight",
        itemKey: subjectKey(subject),
      },
    });
    profile = buildAiProfile(result.output, inputFingerprint);
  } catch (error) {
    console.warn(`[character-height] ${subjectKey(subject)} 使用兼容比例：${error instanceof Error ? error.message : String(error)}`);
    profile = createFallbackCharacterHeightProfile(inputFingerprint);
  }
  return persistProfile(subject, profile);
}

class CharacterHeightProfileService {
  private readonly inFlight = new Map<string, Promise<CharacterHeightProfile>>();

  private ensureSubject(subject: CharacterHeightSubject): Promise<CharacterHeightProfile> {
    const key = subjectKey(subject);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = ensureSubject(subject).finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  async ensureNovel(novelId: string, names: string[]): Promise<Map<string, CharacterHeightProfile>> {
    const normalizedNames = [...new Set(names.map(normalizedName).filter(Boolean))];
    if (normalizedNames.length === 0) return new Map();
    const rows = await prisma.character.findMany({
      where: { novelId, name: { in: names.map((name) => name.trim()).filter(Boolean) } },
      select: {
        id: true,
        name: true,
        role: true,
        gender: true,
        ageGroup: true,
        physique: true,
        appearance: true,
        personality: true,
        background: true,
        attireStyle: true,
        facePrompt: true,
        statesJson: true,
        heightProfileJson: true,
        updatedAt: true,
      },
    });
    const profiles = await Promise.all(rows.map((row) => this.ensureSubject({ ...row, kind: "novel" })));
    return new Map(rows.map((row, index) => [normalizedName(row.name), profiles[index]]));
  }

  async ensureDrama(projectId: string, ids: string[]): Promise<Map<string, CharacterHeightProfile>> {
    const normalizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) return new Map();
    const rows = await prisma.dramaCharacter.findMany({
      where: { projectId, id: { in: normalizedIds } },
      select: {
        id: true,
        name: true,
        archetype: true,
        persona: true,
        visualAnchor: true,
        speechStyle: true,
        relations: true,
        heightProfileJson: true,
        updatedAt: true,
      },
    });
    const profiles = await Promise.all(rows.map((row) => this.ensureSubject({
      ...row,
      relations: [row.relations, row.speechStyle].filter(Boolean).join("；"),
      kind: "drama",
    })));
    return new Map(rows.map((row, index) => [row.id, profiles[index]]));
  }
}

export const characterHeightProfileService = new CharacterHeightProfileService();

export async function ensureNovelCharacterHeightProfiles(novelId: string, names: string[]) {
  return characterHeightProfileService.ensureNovel(novelId, names);
}

export async function ensureDramaCharacterHeightProfiles(projectId: string, ids: string[]) {
  return characterHeightProfileService.ensureDrama(projectId, ids);
}
