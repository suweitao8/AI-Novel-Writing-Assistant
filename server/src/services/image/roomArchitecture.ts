/**
 * 室内生成的建筑合理性约束（2026-08-27 用户反馈：卧室被画出两个门）：
 * 门/窗这类结构性开口必须有确定性数量语义，且不得出现镜像复制出来的重复墙段。
 * 只对场景（含状态图全景与设定页全景）注入；角色/道具与分镜参考链不消费。
 */
export const ROOM_ARCHITECTURE_PROMPT_LINES = [
  "architectural sanity for interiors: exactly one entrance door per habitable space unless the text explicitly names additional doors",
  "windows exist only where the text describes them, never duplicated across walls",
  "walls are continuous planes with straight edges and consistent scale: no mirrored copy-paste wall segments, no cloned furniture blocks, openings align with lintel and floor heights",
] as const;

export const ROOM_ARCHITECTURE_NEGATIVE_PROMPT = [
  "duplicate doors, multiple entrance doors, repeated identical windows, mirrored wall sections, cloned furniture blocks",
].join(", ");
