/**
 * Scene panorama image contract shared by every scene-image generation entry.
 *
 * The 2:1 equirectangular source is later projected onto the 3D EnviroDome;
 * keeping this layout contract in the image boundary prevents comic, novel
 * asset-state and legacy scene generators from drifting apart.
 *
 * Vertical zones in texture coordinates (v=0 top, v=1 bottom; the client flat
 * view states the same boundaries counting from the bottom as 50% / 70%):
 * - v=0.0-0.3  sky / ceiling only (top 30%);
 * - v=0.3-0.5  distant band: skyline, far background and all tall objects;
 * - v=0.5-1.0  continuous clean ground (bottom 50%).
 * The boundaries must stay in sync with STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V /
 * STORY_SCENE_3D_PANORAMA_SKY_V in shared/types/comicDrama.ts. They are image
 * composition targets; the per-scene panoramaHorizonV environment parameter only
 * adjusts the 3D projection mapping and never feeds back into generation.
 */
export const SCENE_PANORAMA_LAYOUT_PROMPT_LINES = [
  "strict three-zone equirectangular vertical layout with two fixed boundaries: the horizon line at v=0.5 and the sky line at v=0.3; both are texture-coordinate contracts, never visible lines, seams, stripes, split-screens or collages",
  "lower ground zone v=0.52-1.0 (the whole bottom half below v=0.5) contains only one continuous clean ground, floor or terrain surface with sparse low-lying natural detail and no furniture, object fragments or repeated props",
  "the narrow center band v=0.48-0.52 remains empty and uncluttered as a safe horizon transition; no object, furniture leg, hard contact fragment or large shadow crosses it",
  "middle distant zone v=0.3-0.5 holds the distant view: far skyline, mountains, tree lines, distant buildings and walls, plus every bed, table, chair, sofa, cabinet, tree, building, rock and other tall object kept complete and fully contained between v=0.3 and v=0.48 with a clean safety margin; bodies, legs, feet and hard fragments must not enter the center band or the ground zone",
  "upper sky zone v=0.0-0.3 contains only clean sky or ceiling with soft gradients, clouds and natural lighting; no distant objects, structure tops, floating fragments or debris reach above the sky line",
] as const;

/** Negative constraints for objects that would be split or stretched after projection. */
export const SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT =
  "furniture or objects in the lower half, furniture legs crossing the horizon, objects crossing the center line, object fragments in the center safety band, split furniture, structure tops or distant objects above the sky line, objects crossing the sky boundary, visible horizon line, seam, stripe, split-screen, collage, stretched props on the ground, cluttered floor, repeated ground objects";
