// 脚本文档（漫剧「当前 · 脚本」页签）：Chapter.expectation 文本与结构化条目列表的双向转换。
// 文本格式是唯一存储（自动保存、参考解析、后续分镜/视频生成都读它）；列表只是它的结构化视图——
// parse 拆成条目渲染，编辑后 serialize 回写，往返保持格式稳定。
// 行格式（与 reference_draft v8 序列化输出一致）：
// - 【场景：客厅】 场景切换（切换行下的状态面板把「场景状态/出场角色状态」写成标记行）
// - 【场景状态：客厅：夜晚】 场景形象切换（该场景用哪个状态出图）
// - 【角色状态：李火旺：重伤】 角色形象切换
// - 【画风：末世废土】 时代风格切换（用户手动插入；对后续内容生效，新章节沿用最近一次）
// - 分镜：景别，画面
// - 说话人（神态）：内容 / 旁白：内容
// 空行是块分隔（一个块=可选标记行+分镜行+若干台词行）；不认识的行原样保留为 text 条目，不丢内容。

export const SCRIPT_SHOT_TYPES = ["大远景", "远景", "全景", "中景", "近景", "特写"] as const;
export type ScriptShotType = (typeof SCRIPT_SHOT_TYPES)[number];

export type ScriptItem =
  | { kind: "scene"; scene: string }
  | { kind: "sceneState"; scene: string; state: string }
  | { kind: "state"; name: string; state: string }
  | { kind: "style"; style: string }
  | { kind: "shot"; shot: ScriptShotType; storyboard: string }
  | { kind: "line"; speaker: string; mood: string; text: string }
  | { kind: "text"; text: string };

const SCENE_STATE_PATTERN = /^[ \t]*【场景状态[：:]\s*([^：:】]+?)[：:]([^：:】]+?)】[ \t]*$/;
const SCENE_PATTERN = /^[ \t]*【场景[：:]\s*([^】]+?)】[ \t]*$/;
const STATE_PATTERN = /^[ \t]*【角色状态[：:]\s*([^：:】]+?)[：:]([^：:】]+?)】[ \t]*$/;
const STYLE_PATTERN = /^[ \t]*【画风[：:]\s*([^】]+?)】[ \t]*$/;
const SHOT_PATTERN = /^[ \t]*分镜[：:]\s*(大远景|远景|全景|中景|近景|特写)[，,]\s*(.+)$/;
const SPEAKER_PATTERN = /^[ \t]*([^\s：:（(]{1,20})(?:[（(]([^）)]{0,20})[)）])?[：:]\s*(.+)$/;

export function parseScriptItems(text: string): ScriptItem[] {
  const items: ScriptItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const sceneState = SCENE_STATE_PATTERN.exec(line);
    if (sceneState) {
      items.push({ kind: "sceneState", scene: sceneState[1].trim(), state: sceneState[2].trim() });
      continue;
    }
    const scene = SCENE_PATTERN.exec(line);
    if (scene) {
      items.push({ kind: "scene", scene: scene[1].trim() });
      continue;
    }
    const state = STATE_PATTERN.exec(line);
    if (state) {
      items.push({ kind: "state", name: state[1].trim(), state: state[2].trim() });
      continue;
    }
    const style = STYLE_PATTERN.exec(line);
    if (style) {
      items.push({ kind: "style", style: style[1].trim() });
      continue;
    }
    // 其他【…】标记（如已废弃的【风格：…】）当普通文本保留，不丢内容。
    if (line.startsWith("【") && line.endsWith("】")) {
      items.push({ kind: "text", text: line });
      continue;
    }
    const shot = SHOT_PATTERN.exec(line);
    if (shot) {
      items.push({ kind: "shot", shot: shot[1] as ScriptShotType, storyboard: shot[2].trim() });
      continue;
    }
    const speaker = SPEAKER_PATTERN.exec(line);
    if (speaker) {
      items.push({
        kind: "line",
        speaker: speaker[1],
        mood: (speaker[2] ?? "").trim(),
        text: speaker[3].trim(),
      });
      continue;
    }
    items.push({ kind: "text", text: line });
  }
  return items;
}

export function serializeScriptItems(items: ScriptItem[]): string {
  // 块规则（与解析产出的 canonical 格式一一对应）：标记行（场景/场景状态/状态/画风）直接跟在块首，
  // 分镜行接在标记行后面；台词/文本落进当前块；标记或分镜出现在台词之后才开新块。
  const blocks: string[][] = [];
  let current: string[] | null = null;
  const currentHasContent = () => current !== null && current.some((line) => !line.startsWith("【"));
  for (const item of items) {
    let line: string;
    let isMarkerOrShot = false;
    if (item.kind === "scene") {
      line = `【场景：${item.scene.trim()}】`;
      isMarkerOrShot = true;
    } else if (item.kind === "sceneState") {
      line = `【场景状态：${item.scene.trim()}：${item.state.trim()}】`;
      isMarkerOrShot = true;
    } else if (item.kind === "state") {
      line = `【角色状态：${item.name.trim()}：${item.state.trim()}】`;
      isMarkerOrShot = true;
    } else if (item.kind === "style") {
      line = `【画风：${item.style.trim()}】`;
      isMarkerOrShot = true;
    } else if (item.kind === "shot") {
      line = `分镜：${item.shot}，${item.storyboard.trim()}`;
      isMarkerOrShot = true;
    } else if (item.kind === "line") {
      const speaker = item.speaker.trim();
      const mood = item.mood.trim();
      const text = item.text.trim();
      if (!text) {
        // 没有内容的台词行（只剩说话人）没有意义，直接丢弃。
        continue;
      }
      line = speaker ? `${speaker}${mood ? `（${mood}）` : ""}：${text}` : text;
    } else {
      line = item.text.trim();
    }
    if (!line) {
      continue;
    }
    if (current === null || (isMarkerOrShot && currentHasContent())) {
      current = [];
      blocks.push(current);
    }
    current.push(line);
  }
  return blocks.map((block) => block.join("\n")).join("\n\n");
}

// 往返一致是脚本文档的硬契约：列表编辑后回写文本，再解析必须得到同样的条目
// （canonical 文本再序列化也必须逐字稳定），否则列表编辑会悄悄改坏内容。
export function roundTripScriptItems(text: string): ScriptItem[] {
  return parseScriptItems(serializeScriptItems(parseScriptItems(text)));
}
