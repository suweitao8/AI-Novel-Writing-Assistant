import * as pc from "playcanvas";

export interface ModelMaterialCullingInput {
  opacity?: string;
}
export function applyModelMaterialCulling(
  material: Pick<pc.StandardMaterial, "cull">,
  info: ModelMaterialCullingInput | undefined,
): void {
  const hasOpacity = typeof info?.opacity === "string" && info.opacity.trim().length > 0;
  material.cull = hasOpacity ? pc.CULLFACE_NONE : pc.CULLFACE_BACK;
}
