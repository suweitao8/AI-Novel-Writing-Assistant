// 设定中心 → 写作上下文的紧凑文本构建。
// 短篇（shortStoryPromptContext）与章节（GenerationContextAssembler）两条注入路径共用，
// 保证同一本书在两条通道里看到的设定约束文本一致。
export interface StorySettingsPromptSnapshot {
  characters: Array<{ name: string; role: string; personality: string | null }>;
  scenes: Array<{ name: string; summary: string | null; significance: string | null }>;
  props: Array<{ name: string; description: string | null; plotFunction: string | null; importance: string }>;
  world: {
    premise: string;
    era: string | null;
    toneRules: string[];
    keySettings: Array<{ title: string; content: string }>;
    locationNames: string[];
  } | null;
}

export function buildStorySettingsPromptText(snapshot: StorySettingsPromptSnapshot | null | undefined): string {
  if (!snapshot) {
    return "";
  }
  const lines: string[] = [];
  if (snapshot.characters.length > 0) {
    lines.push("【角色】");
    lines.push(...snapshot.characters.map((character) => (
      `- ${character.name}（${character.role}）${character.personality ? `：${character.personality}` : ""}`
    )));
  }
  if (snapshot.scenes.length > 0) {
    lines.push("【场景】");
    lines.push(...snapshot.scenes.map((scene) => (
      `- ${scene.name}${scene.summary ? `：${scene.summary}` : ""}${scene.significance ? `（故事作用：${scene.significance}）` : ""}`
    )));
  }
  if (snapshot.props.length > 0) {
    lines.push("【关键道具】");
    lines.push(...snapshot.props.map((prop) => (
      `- ${prop.name}（${prop.importance}）${prop.description ? `：${prop.description}` : ""}${prop.plotFunction ? `（剧情功能：${prop.plotFunction}）` : ""}`
    )));
  }
  if (snapshot.world) {
    lines.push("【世界观】");
    lines.push(`- 前提：${snapshot.world.premise}`);
    if (snapshot.world.era) {
      lines.push(`- 时代：${snapshot.world.era}`);
    }
    if (snapshot.world.toneRules.length > 0) {
      lines.push(`- 基调：${snapshot.world.toneRules.join("；")}`);
    }
    lines.push(...snapshot.world.keySettings.map((setting) => `- ${setting.title}：${setting.content}`));
    if (snapshot.world.locationNames.length > 0) {
      lines.push(`- 地图地点：${snapshot.world.locationNames.join("、")}`);
    }
  }
  const content = lines.join("\n");
  if (!content.trim()) {
    return "";
  }
  return [
    "以下是本书动笔前确认的设定。正文必须与这些设定保持一致：",
    "角色言行符合各自性格；剧情发生在既定场景内并体现其氛围；关键道具按既定功能使用；",
    "世界观设定（力量体系/规则/禁忌）不得违背。可以在正文中自然展开细节，但不得推翻设定。",
    "",
    content,
  ].join("\n");
}
