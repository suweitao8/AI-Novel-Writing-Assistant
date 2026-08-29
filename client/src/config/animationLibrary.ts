/**
 * 动画库目录：内置角色动画的静态清单。
 *
 * 与模型库同一套「静态目录 + 前端静态文件」约定：目录只是数据，不做任何
 * 运行时探测；GLB 放 client/public/anims/ 由前端静态服务。文件来自 Cine57
 * （UE 5.7）动画经 FBX 导出、按绑定姿态差离线重定向到 UAL2 骨架后合并生成，
 * 一个 GLB 内含 UAL2 角色与全部动作片段，目录条目用 clipName 指向其中的动画。
 */

/** 动画库目录条目。 */
export interface AnimationLibraryEntry {
  id: string;
  name: string;
  category: string;
  /** 片段所在 GLB 的访问地址。 */
  fileUrl: string;
  /** GLB 内的动作片段名，与 glTF animations[].name 一致。 */
  clipName: string;
  /** 片段时长（秒）。 */
  durationSeconds: number;
  source: string;
}

export const ANIMATION_LIBRARY_SOURCE = "Cine57";

/** 动画分类页签（与目录条目的 category 对应）。 */
export const ANIMATION_LIBRARY_CATEGORIES = ["待机", "移动", "坐姿"] as const;

const UAL2_UE_ANIMS_URL = "/anims/cine57/UAL2_UE_Anims.glb";

export const ANIMATION_LIBRARY: AnimationLibraryEntry[] = [
  { id: "idle-stand", name: "站立待机", category: "待机", fileUrl: UAL2_UE_ANIMS_URL, clipName: "A_INP_Idle", durationSeconds: 2.71, source: ANIMATION_LIBRARY_SOURCE },
  { id: "walk-forward", name: "行走循环", category: "移动", fileUrl: UAL2_UE_ANIMS_URL, clipName: "A_INP_WalkFwd_Loop", durationSeconds: 1.08, source: ANIMATION_LIBRARY_SOURCE },
  { id: "chair-loop", name: "坐姿循环", category: "坐姿", fileUrl: UAL2_UE_ANIMS_URL, clipName: "A_chair_loop01", durationSeconds: 4.0, source: ANIMATION_LIBRARY_SOURCE },
];

export function getAnimationLibraryEntry(id: string | undefined): AnimationLibraryEntry | undefined {
  return ANIMATION_LIBRARY.find((entry) => entry.id === id);
}
