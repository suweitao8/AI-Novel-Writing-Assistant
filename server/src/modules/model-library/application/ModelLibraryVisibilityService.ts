import { prisma } from "../../../db/prisma";

export const MODEL_LIBRARY_VISIBILITY_KEY_PREFIX = "model-library:hidden:";

const MODEL_LIBRARY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

type AppSettingStore = Pick<typeof prisma.appSetting, "findMany" | "upsert" | "deleteMany">;

export interface ModelLibraryVisibilityState {
  modelId: string;
  hidden: boolean;
}

function assertSafeModelId(modelId: string): string {
  if (typeof modelId !== "string" || !MODEL_LIBRARY_ID_PATTERN.test(modelId)) {
    throw new Error("模型 ID 不合法。");
  }
  return modelId;
}

function settingKeyFor(modelId: string): string {
  return `${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}${encodeURIComponent(assertSafeModelId(modelId))}`;
}

function modelIdFromSettingKey(key: string): string | null {
  if (!key.startsWith(MODEL_LIBRARY_VISIBILITY_KEY_PREFIX)) return null;
  const encodedId = key.slice(MODEL_LIBRARY_VISIBILITY_KEY_PREFIX.length);
  try {
    const modelId = decodeURIComponent(encodedId);
    return MODEL_LIBRARY_ID_PATTERN.test(modelId) ? modelId : null;
  } catch {
    return null;
  }
}

export class ModelLibraryVisibilityService {
  constructor(private readonly appSetting: AppSettingStore = prisma.appSetting) {}

  async listHiddenModelIds(): Promise<string[]> {
    const settings: Array<{ key: string }> = await this.appSetting.findMany({
      where: { key: { startsWith: MODEL_LIBRARY_VISIBILITY_KEY_PREFIX } },
      select: { key: true },
      orderBy: { key: "asc" },
    }) as Array<{ key: string }>;
    return settings
      .map((setting) => modelIdFromSettingKey(setting.key))
      .filter((modelId): modelId is string => modelId !== null);
  }

  async hideModel(modelId: string): Promise<ModelLibraryVisibilityState> {
    const key = settingKeyFor(modelId);
    await this.appSetting.upsert({
      where: { key },
      update: { value: "hidden" },
      create: { key, value: "hidden" },
    });
    return { modelId, hidden: true };
  }

  async restoreModel(modelId: string): Promise<ModelLibraryVisibilityState> {
    const key = settingKeyFor(modelId);
    await this.appSetting.deleteMany({ where: { key } });
    return { modelId, hidden: false };
  }
}

export const modelLibraryVisibilityService = new ModelLibraryVisibilityService();
