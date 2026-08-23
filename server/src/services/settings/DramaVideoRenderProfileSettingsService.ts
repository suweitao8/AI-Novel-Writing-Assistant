import { prisma } from "../../db/prisma";
import {
  getDramaRenderProfile,
  getDramaRenderProfileById,
  getDramaRenderProfiles,
  type DramaRenderProfile,
} from "../drama/video/renderProfile";
import { isMissingTableError } from "./ragLegacyCompatibility";

export const DRAMA_VIDEO_RENDER_PROFILE_SETTING_KEY = "drama.videoRenderProfile";

export interface DramaVideoRenderProfileSettings {
  profile: DramaRenderProfile;
  options: DramaRenderProfile[];
}

function buildSettings(profile: DramaRenderProfile): DramaVideoRenderProfileSettings {
  return {
    profile,
    options: getDramaRenderProfiles(),
  };
}

export async function getDramaVideoRenderProfileSettings(): Promise<DramaVideoRenderProfileSettings> {
  let configuredValue: string | undefined;
  try {
    const record = await prisma.appSetting.findUnique({
      where: { key: DRAMA_VIDEO_RENDER_PROFILE_SETTING_KEY },
    });
    configuredValue = record?.value?.trim() || undefined;
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const profile = configuredValue
    ? getDramaRenderProfileById(configuredValue)
    : getDramaRenderProfile();
  return buildSettings(profile);
}

export async function getConfiguredDramaRenderProfile(): Promise<DramaRenderProfile> {
  const settings = await getDramaVideoRenderProfileSettings();
  return settings.profile;
}

export async function saveDramaVideoRenderProfile(profileId: unknown): Promise<DramaVideoRenderProfileSettings> {
  const profile = getDramaRenderProfileById(profileId);
  await prisma.appSetting.upsert({
    where: { key: DRAMA_VIDEO_RENDER_PROFILE_SETTING_KEY },
    update: { value: profile.id },
    create: {
      key: DRAMA_VIDEO_RENDER_PROFILE_SETTING_KEY,
      value: profile.id,
    },
  });
  return buildSettings(profile);
}
