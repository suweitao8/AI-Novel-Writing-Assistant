import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface IndexTTS25VoiceCatalog {
  available: boolean;
  health: {
    status?: string;
    modelLoaded?: boolean;
    qwenEmotion?: boolean;
  } | null;
  speakers: string[];
  referenceVoices: string[];
  defaultSpeaker: string;
  defaultReferenceAudio: string;
  apiBaseURL: string;
  webUIUrl: string;
  error?: string;
}

export async function getIndexTTS25VoiceCatalog(): Promise<IndexTTS25VoiceCatalog> {
  const { data } = await apiClient.get<ApiResponse<IndexTTS25VoiceCatalog>>("/drama/index-tts25/catalog");
  return data.data ?? {
    available: false,
    health: null,
    speakers: [],
    referenceVoices: [],
    defaultSpeaker: "default",
    defaultReferenceAudio: "",
    apiBaseURL: "",
    webUIUrl: "",
    error: data.message,
  };
}

export async function saveIndexTTS25ReferenceAudio(audioDataUrl: string): Promise<{ fileName: string }> {
  const { data } = await apiClient.post<ApiResponse<{ fileName: string }>>(
    "/drama/index-tts25/references",
    { audioDataUrl },
  );
  if (!data.data?.fileName) {
    throw new Error(data.message || "参考音频保存失败。");
  }
  return data.data;
}
