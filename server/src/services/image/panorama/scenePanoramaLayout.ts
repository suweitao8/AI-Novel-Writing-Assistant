/**
 * Scene panorama image contract shared by every scene-image generation entry.
 *
 * The 2:1 equirectangular source is later projected onto the 3D EnviroDome;
 * keeping this layout contract in the image boundary prevents comic, novel
 * asset-state and legacy scene generators from drifting apart.
 */
export const SCENE_PANORAMA_LAYOUT_PROMPT_LINES = [
  "strict two-zone equirectangular layout split by the exact fixed vertical center line v=0.5; v=0.5 is a texture-coordinate contract, never a visible line, seam, stripe, split-screen or collage",
  "upper zone v=0.0-0.48 contains the sky or ceiling, walls, distant background and complete fixed environment objects",
  "every bed, table, chair, sofa, cabinet, tree, building, rock and other tall object must be complete and fully contained above v=0.48 with a clean safety margin; its body, legs, feet and hard fragments must not enter the center band or lower zone",
  "lower zone v=0.52-1.0 contains only one continuous clean ground, floor or terrain surface with sparse low-lying natural detail and no furniture, object fragments or repeated props",
  "the narrow center band v=0.48-0.52 remains empty and uncluttered as a safe horizon transition; no object, furniture leg, hard contact fragment or large shadow crosses it",
] as const;

/** Negative constraints for objects that would be split or stretched after projection. */
export const SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT =
  "furniture or objects in the lower half, furniture legs crossing the horizon, objects crossing the center line, object fragments in the center safety band, split furniture, visible horizon line, seam, stripe, split-screen, collage, stretched props on the ground, cluttered floor, repeated ground objects";
