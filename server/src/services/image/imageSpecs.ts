import { DEFAULT_NOVEL_COVER_IMAGE_SIZE } from "@ai-novel/shared/types/image";
import type { ImageSize } from "./types";

/**
 * 产品生图规格规范（单一来源）。
 *
 * 画幅规范沿用旧项目 mydrama 的约定：
 * - 设计参考类（角色四视图、场景全景、服装/武器资产）固定**横版**——横向并排多视图时空间信息最全；
 * - 阅读消费类（漫剧分镜首帧、漫画分格兜底、小说封面）固定**竖版**——竖屏阅读与封面装帧形态；
 * - 头像类（角色头像、拆书角色形象）用方图——展示位是圆形/方形头像框。
 *
 * 各生图服务必须从这里取值，不允许在服务内再硬编码尺寸；
 * 修改任何一项规格前先确认对应的 UI 展示比例（GeneratedImageCard 等）仍然匹配。
 */
export const IMAGE_SPECS = {
  /** 角色四视图/表情稿（漫画与漫剧共用）：横版 */
  characterSheet: "1536x1024" as ImageSize,
  /** 场景 360° 全景参考图：2:1 等距柱状全景（equirectangular 标准比例，2026-08-23 用户要求）。
   *  只有 Codex 通道支持该比例（grok_build 固定输出 1280x720），场景图因此统一走 Codex。 */
  scenePanorama: "2048x1024" as ImageSize,
  /** 服装/武器等角色资产设计参考图：横版（旧项目道具参考图固定 16:9 横屏） */
  characterAsset: "1536x1024" as ImageSize,
  /** 漫剧分镜首帧：竖版 2:3 */
  dramaKeyframe: "1024x1536" as ImageSize,
  /** 漫画分格兜底画幅（正式值跟随漫画模板的 imageSize）：竖版 */
  comicPanelFallback: "1024x1536" as ImageSize,
  /** 小说封面：竖版（与 shared 常量保持同源） */
  novelCover: DEFAULT_NOVEL_COVER_IMAGE_SIZE as ImageSize,
} as const;

export type ImageSpecKey = keyof typeof IMAGE_SPECS;
