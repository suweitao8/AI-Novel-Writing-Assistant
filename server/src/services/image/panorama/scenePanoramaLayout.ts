/**
 * Scene panorama image contract shared by every scene-image generation entry.
 *
 * The 2:1 equirectangular source is later projected onto the 3D EnviroDome;
 * keeping this layout contract in the image boundary prevents comic, novel
 * asset-state and legacy scene generators from drifting apart.
 *
 * Background-only rule (2026-08-29 product decision): the panorama is a pure
 * backdrop. Foreground props — indoor furniture such as beds, tables, chairs
 * and cabinets, outdoor rocks, grass, bushes and similar placeable items — are
 * added later as interactive 3D models in the scene editor, so the generated
 * panorama must contain none of them in any zone.
 *
 * Vertical zones in texture coordinates (v=0 top, v=1 bottom; the client flat
 * view states the same boundaries counting from the bottom as 50% / 70%):
 * - v=0.0-0.3  sky / ceiling only (top 30%);
 * - v=0.3-0.5  far background band: architecture and distant scenery only;
 * - v=0.5-1.0  continuous clean ground (bottom 50%).
 * The boundaries must stay in sync with STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V /
 * STORY_SCENE_3D_PANORAMA_SKY_V in shared/types/comicDrama.ts. They are image
 * composition targets; the per-scene panoramaHorizonV environment parameter only
 * adjusts the 3D projection mapping and never feeds back into generation.
 */
export const SCENE_PANORAMA_LAYOUT_PROMPT_LINES = [
  "strict three-zone equirectangular vertical layout with two fixed boundaries: the horizon line at v=0.5 and the sky line at v=0.3; both are texture-coordinate contracts, never visible lines, seams, stripes, split-screens or collages",
  "the lower half is not a perspective view of the space: it renders as one seamless floor material seen from directly above, like an empty top-down floor texture swatch filling the entire bottom half",
  "lower ground zone v=0.52-1.0 (the whole bottom half below v=0.5) contains only one continuous clean ground, floor or terrain surface and nothing placed on it: no furniture, no props, no rocks, stones, grass tufts, bushes, logs, crates or scattered debris",
  "the narrow center band v=0.48-0.52 remains empty and uncluttered as a safe horizon transition; no object, furniture leg, hard contact fragment or large shadow crosses it",
  // 2026-08-29 产品方向：全景只做背景，前景道具改为后续摆放 3D 模型（室内家具、
  // 室外石块/草丛/灌木一律不入图），避免背景里长死道具、角色无法与道具交互。
  "background-only panorama: this image is a pure backdrop for a 3D scene that gets its foreground props placed later as separate 3D models, so the panorama itself contains no placeable props in any zone — no beds, tables, chairs, sofas, desks, cabinets, shelves, counters, and no near-field rocks, stones, grass tufts, bushes, shrubs, plants, logs, crates or ground clutter",
  // 2026-08-26 用户反馈室内家具仍大量越过 50% 线：给模型一个物理上可执行的逃逸规则——
  // 装不下就画小画远，而不是跨界；物体最低点（含接触阴影）以中线为硬顶。
  "hard middle-line ceiling: the lowest point of every object that remains in view — wall bases, window sills, distant building feet and their contact shadows — must stay above v=0.5; when perspective would push any part of a structure below the middle of the image, redraw the whole room smaller and farther away instead of crossing the line",
  "middle distant zone v=0.3-0.5 holds only the far background of the space: indoor far walls with windows and doors, outdoor skylines, mountains, distant tree lines and far buildings, all small, distant and fully contained between v=0.3 and v=0.48 with a clean safety margin; nothing stands in the foreground or on the ground",
  "upper sky zone v=0.0-0.3 contains only clean sky or ceiling with soft gradients, clouds and natural lighting; no distant objects, structure tops, floating fragments or debris reach above the sky line",
] as const;

/**
 * Interior reinforcement. A physically-correct equirect interior can never satisfy
 * the contract (a real camera at eye level always puts the wall-floor junction and
 * nearby furniture below the middle), so photo-realism priors keep winning. Stop
 * fighting physics: describe a composition that is self-consistent — a flat stage
 * backdrop painting for the room band plus a separate flooring swatch below.
 * Since 2026-08-29 the backdrop painting shows only bare architecture: furniture
 * is never drawn, not even small pieces against the far wall.
 */
export const SCENE_PANORAMA_INTERIOR_PROMPT_LINES = [
  // 2026-08-26 二轮重构：放弃「真实房间透视」框架，改用舞台布景海报式双层构图——
  // 上半层是正面平视的房间背景板，下半层是独立的地板材质样片，两层物理上互不侵入。
  // 2026-08-29 起背景板只画裸建筑：门窗与固定装修，家具一律不画。
  "interior composition: build the picture like a theater set poster in two flat layers — the top half is a straight-on backdrop painting of the room's far walls with windows, doors and built-in architecture only, and the bottom half is a separate flat swatch of the empty flooring seen from directly above",
  "the room is completely unfurnished: no beds, tables, chairs, sofas, desks, cabinets, shelves, counters, stoves, rugs with objects or any other furniture or standing props anywhere in the image, not even small pieces against the far wall; furniture is placed later as separate 3D models in the scene editor",
  "keep the backdrop walls bare of standing objects so the wall-floor junction reads as one clean straight line resting on or above the middle of the image",
  "the flooring swatch stays completely empty — no furniture, rugs with objects, clutter, rocks, grass, bushes or object imprints drawn on the floor",
  // 2026-08-26 用户要求（两轮收敛）：提示词明确写了的照片（如老照片）允许上墙且必须有相框；
  // 没写数量的最多一张，不得额外铺开照片墙；提示词完全没提照片时一张都不出。
  "wall décor rule: anything framed or hung on the walls is decorative media — movie, music, anime, sports or idol posters, paintings, illustrations, prints, clocks or mirrors; photographs appear on walls only when the scene description explicitly mentions them (for example an old family photo), and each must sit inside a proper picture frame",
  "photo restraint: render at most one framed photograph unless the scene description explicitly names a larger amount; never add extra photographs, grids of frames or a photo collage wall beyond what the description asks for",
] as const;

/** Layout lines for a scene type; interiors append the reinforcement lines. */
export function scenePanoramaLayoutLinesFor(
  sceneType: string | null | undefined,
): readonly string[] {
  return sceneType === "interior"
    ? [...SCENE_PANORAMA_LAYOUT_PROMPT_LINES, ...SCENE_PANORAMA_INTERIOR_PROMPT_LINES]
    : SCENE_PANORAMA_LAYOUT_PROMPT_LINES;
}

/** Negative constraints for objects that would be split or stretched after projection. */
export const SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT =
  "any furniture anywhere in the image, beds, tables, chairs, sofas, desks, cabinets, shelves, counters, near-field rocks, stones, boulders, grass tufts, bushes, shrubs, potted plants, logs, crates, ground clutter props, scattered debris on the ground, furniture or objects in the lower half, furniture painted or cloned on the floor, furniture legs below the horizon, skirting board or wall base in the lower half, furniture legs crossing the horizon, oversized foreground furniture, close-up furniture crossing the middle of the image, furniture bottoms cropped by the horizon, objects crossing the center line, object fragments in the center safety band, split furniture, structure tops or distant objects above the sky line, objects crossing the sky boundary, visible horizon line, seam, stripe, split-screen, collage, stretched props on the ground, cluttered floor, repeated ground objects, unprompted framed portraits, extra photographs beyond the described one, many framed photos on one wall, photo collage wall, frameless loose photos";
