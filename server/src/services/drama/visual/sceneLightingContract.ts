const SCENE_TYPE_LABELS: Record<string, string> = {
  interior: "室内",
  exterior: "室外",
  nature: "自然环境",
};

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: "早晨",
  noon: "正午",
  night: "夜晚",
};

const WEATHER_LABELS: Record<string, string> = {
  sunny: "晴天",
  cloudy: "阴天",
  rainy: "雨天",
};

export interface SceneLightingContractInput {
  sceneName: string;
  stateLabel?: string | null;
  sceneType?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  hasReferenceImage: boolean;
}

function labelOf(value: string | null | undefined, labels: Record<string, string>): string | null {
  const normalized = value?.trim();
  return normalized ? labels[normalized] ?? normalized : null;
}

export function buildSceneLightingContract(input: SceneLightingContractInput): string {
  const sceneName = input.sceneName.trim() || "当前场景";
  const stateLabel = input.stateLabel?.trim() || "默认";
  const stateFacts = [
    labelOf(input.sceneType, SCENE_TYPE_LABELS),
    labelOf(input.timeOfDay, TIME_OF_DAY_LABELS),
    labelOf(input.weather, WEATHER_LABELS),
  ].filter(Boolean).join("、");
  const basis = stateFacts ? `场景状态为${stateFacts}` : "场景状态以设定中心为准";
  const anchor = input.hasReferenceImage
    ? `严格以「${sceneName} · ${stateLabel}状态图」中的光源方向、色温、明暗比例、阴影软硬和空气透视为唯一光照基准`
    : `当前没有可用场景状态图，固定依据${basis}建立自然、连续的光照关系`;
  return `场景光照契约：${anchor}；${basis}只用于解释该光照基准。镜头可以改变构图、景别和角色动作，但不得重新设计场景照明；除非画面内容明确出现新的画面内光源，否则所有镜头保持同一光照关系。`;
}

export function buildSceneLightingAvoidInstructions(): string {
  return "禁止脱离场景光照契约新增暖黄光、冷蓝光、血红光、霓虹光、强逆光、强轮廓光、强体积光或新的主光方向；不要给角色单独添加与场景不一致的主光。";
}
