export type Blocking3dActorColor = readonly [number, number, number];

export type Blocking3dActorMaterialRole = "main" | "joints" | "neck";

export const BLOCKING_3D_BLUE_ACTOR_COLOR = [0.24, 0.52, 0.82] as const;
export const BLOCKING_3D_JOINT_MATERIAL_NAME = "M_Joints";
export const BLOCKING_3D_NECK_MATERIAL_NAME = "M_Neck";
export const BLOCKING_3D_ACTOR_JOINT_HIGHLIGHT_RATIO = 0.42;

export function getBlocking3dActorJointColor(
  color: Blocking3dActorColor,
): [number, number, number] {
  return color.map((channel) => {
    const normalizedChannel = Number.isFinite(channel) ? channel : 0;
    return Math.min(
      1,
      Math.max(
        0,
        normalizedChannel +
          (1 - normalizedChannel) * BLOCKING_3D_ACTOR_JOINT_HIGHLIGHT_RATIO,
      ),
    );
  }) as [number, number, number];
}

export function getBlocking3dActorMaterialRole(
  materialName: string | null | undefined,
): Blocking3dActorMaterialRole {
  const normalizedName = materialName?.trim().toLocaleLowerCase();
  if (
    normalizedName === BLOCKING_3D_JOINT_MATERIAL_NAME.toLocaleLowerCase()
  ) {
    return "joints";
  }
  if (normalizedName === BLOCKING_3D_NECK_MATERIAL_NAME.toLocaleLowerCase()) {
    return "neck";
  }
  return "main";
}
