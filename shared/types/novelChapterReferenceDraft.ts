// 参考文本 → 本章初稿契约：漫剧工作室「参考」页签把粘贴的小说原文
// AI 改编成分镜式初稿草稿（不落库，写入 Chapter.expectation 前由用户确认）。
// 每个分镜单元两行：分镜画面 + 旁白/角色台词，单元之间空行分隔。
// 三类切换标记单独成行、放在单元上方，持续生效到下一个同类标记：
// 【场景：地点】换场、【风格：风格名】换画风、【角色状态：名字：状态】换角色形象，
// 后续分镜/视频生成按这些标记切换对应资产。

export interface ChapterReferenceDraftStateSwitch {
  /** 发生外观状态变化的角色名（与设定中心角色名一致） */
  name: string;
  /** 新外观状态名（优先用设定中心登记过的状态名） */
  state: string;
}

export interface ChapterReferenceDraftSegment {
  /** 这一格分镜的景别 */
  shot: "大远景" | "远景" | "全景" | "中景" | "近景" | "特写";
  /** 这一格分镜的画面描述（谁在画面中、动作/姿势/神态、环境） */
  storyboard: string;
  /** 这一格所在的场景（地点名，尽量与设定中心场景名一致；同一场景连续出现时保持同值） */
  scene: string;
  /** 旁白行固定为「旁白」；台词行为原文中说话角色的名字 */
  speaker: string;
  kind: "narration" | "dialogue";
  /** 台词行的神态与语气（听得出的情绪，作为配音提示；旁白行为空串） */
  mood: string;
  /** 这一格的旁白内容或台词 */
  text: string;
  /** 美术风格切换：从这一格起改用新画风（名字来自设定的风格名单）；不切换为空串 */
  styleSwitch?: string;
  /** 角色外观状态切换：从这一格起这些角色的形象发生变化 */
  stateSwitches?: ChapterReferenceDraftStateSwitch[];
}

export interface ChapterReferenceDraftPayload {
  segments: ChapterReferenceDraftSegment[];
  /** 按分镜单元拼好的初稿文本（切换标记行 + 分镜：景别，画面\n说话人（神态）：内容，单元间空行），直接可写入初稿编辑器 */
  draftText: string;
}
