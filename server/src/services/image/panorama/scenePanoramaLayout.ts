/**
 * Scene panorama image contract shared by every scene-image generation entry.
 *
 * The 2:1 equirectangular source is later projected onto the 3D EnviroDome;
 * keeping this layout contract in the image boundary prevents comic, novel
 * asset-state and legacy scene generators from drifting apart.
 *
 * 2026-08-28 product contract: the panorama is a pure BACKGROUND layer. Beds,
 * tables, chairs and other movable furniture are foreground props placed by the
 * user in the 3D scene editor (StoryScene3DMarker) and consumed by blocking
 * composition, so generation must keep them out of the painting entirely.
 *
 * Vertical zones in texture coordinates (v=0 top, v=1 bottom; the client flat
 * view states the same boundaries counting from the bottom as 50% / 70%):
 * - v=0.0-0.3  sky / ceiling only (top 30%);
 * - v=0.3-0.5  distant band: skyline, far background and fixed architecture;
 * - v=0.5-1.0  continuous clean ground (bottom 50%).
 * The boundaries must stay in sync with STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V /
 * STORY_SCENE_3D_PANORAMA_SKY_V in shared/types/comicDrama.ts. They are image
 * composition targets; the per-scene panoramaHorizonV environment parameter only
 * adjusts the 3D projection mapping and never feeds back into generation.
 */
export const SCENE_PANORAMA_LAYOUT_PROMPT_LINES = [
  "strict three-zone equirectangular vertical layout with two fixed boundaries: the horizon line at v=0.5 and the sky line at v=0.3; both are texture-coordinate contracts, never visible lines, seams, stripes, split-screens or collages",
  "the lower half is not a perspective view of the space: it renders as one seamless floor material seen from directly above, like an empty top-down floor texture swatch filling the entire bottom half",
  "lower ground zone v=0.52-1.0 (the whole bottom half below v=0.5) contains only one continuous clean ground, floor or terrain surface with sparse low-lying natural detail and no furniture, object fragments or repeated props",
  // 2026-08-28 用户决定：全景图退化为纯背景，桌椅床等可移动家具不再入画，
  // 前景道具由用户在 3D 场景摆放并与角色交互；场景文案提到家具也不画。
  "furniture-free background: this panorama is a pure background backdrop — never render beds, tables, chairs, sofas, desks, cabinets, shelves, counters, rugs with objects or any other movable furniture and loose props, even when the scene description mentions them; furniture belongs to the foreground layer that is composed separately, not to the background painting",
  "the narrow center band v=0.48-0.52 remains empty and uncluttered as a safe horizon transition; no object, hard contact fragment or large shadow crosses it",
  // 2026-08-26：给模型一个物理上可执行的逃逸规则——装不下就画小画远，而不是跨界；
  // 物体最低点（含接触阴影）以中线为硬顶。
  "hard middle-line ceiling: the lowest point of every object — including building bases, rock feet, tree trunks and their contact shadows — must stay above v=0.5; when perspective would push any part of an object below the middle of the image, redraw the whole view smaller and farther away instead of crossing the line",
  "middle distant zone v=0.3-0.5 holds the distant view: far skyline, mountains, tree lines, distant buildings and walls, plus windows, doors, stairs and other fixed architecture or natural tall elements (trees, rocks) kept complete and fully contained between v=0.3 and v=0.48 with a clean safety margin; bodies, legs, feet and hard fragments must not enter the center band or the ground zone",
  "upper sky zone v=0.0-0.3 contains only clean sky or ceiling with soft gradients, clouds and natural lighting; no distant objects, structure tops, floating fragments or debris reach above the sky line",
] as const;

/**
 * Interior reinforcement. A physically-correct equirect interior can never satisfy
 * the contract (a real camera at eye level always puts the wall-floor junction below
 * the middle), so photo-realism priors keep winning. Stop fighting physics: describe
 * a composition that is self-consistent — a flat stage backdrop painting for the room
 * band plus a separate flooring swatch below. Since 2026-08-28 the backdrop shows
 * fixed décor only; movable furniture never enters the panorama.
 */
export const SCENE_PANORAMA_INTERIOR_PROMPT_LINES = [
  // 2026-08-26 二轮重构：放弃「真实房间透视」框架，改用舞台布景海报式双层构图——
  // 上半层是正面平视的房间背景板，下半层是独立的地板材质样片，两层物理上互不侵入。
  // 2026-08-28 背景板只画固定装修；可移动家具是前景道具，一律不入画。
  "interior composition: build the picture like a theater set poster in two flat layers — the top half is a straight-on backdrop painting of the room's far walls with windows, doors and fixed décor only (wall lamps, paneling, baseboards, curtains), and the bottom half is a separate flat swatch of the empty flooring seen from directly above",
  "furniture-free backdrop: no beds, tables, chairs, sofas, desks, cabinets, shelves, counters or loose props anywhere on the backdrop or the floor, even when the room description names them; an empty-looking room whose furniture is only described in words is the correct result",
  "if any fixed structure would come out big enough to cross the middle line, it is too close to the camera: redraw it smaller and farther back against the far wall — a deep, small-looking room always wins over an object crossing the line",
  "the flooring swatch stays completely empty — no rugs with objects, clutter or furniture imprints drawn on the floor",
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
  "furniture or objects in the lower half, furniture painted or cloned on the floor, furniture legs below the horizon, skirting board or wall base in the lower half, objects crossing the center line, object fragments in the center safety band, split furniture, structure tops or distant objects above the sky line, objects crossing the sky boundary, visible horizon line, seam, stripe, split-screen, collage, stretched props on the ground, cluttered floor, repeated ground objects, any bed, table, chair, sofa, desk, cabinet, shelf or counter anywhere in the image, furniture silhouettes or furniture shadows on the backdrop or floor, loose props and clutter, unprompted framed portraits, extra photographs beyond the described one, many framed photos on one wall, photo collage wall, frameless loose photos";
