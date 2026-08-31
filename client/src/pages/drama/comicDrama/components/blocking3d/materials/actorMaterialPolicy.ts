export type Blocking3dActorColor = readonly [number, number, number];

export type Blocking3dActorMaterialRole = "main" | "joints";

export const BLOCKING_3D_BLUE_ACTOR_COLOR = [0.24, 0.52, 0.82] as const;
export const BLOCKING_3D_JOINT_MATERIAL_NAME = "M_Joints";
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
  return materialName?.trim().toLocaleLowerCase() ===
    BLOCKING_3D_JOINT_MATERIAL_NAME.toLocaleLowerCase()
    ? "joints"
    : "main";
}
