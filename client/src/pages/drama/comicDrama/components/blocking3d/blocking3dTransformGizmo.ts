import * as pc from "playcanvas";

/**
 * Unity 场景视图同款变换工具：移动 / 旋转 / 缩放。
 * 底层是 PlayCanvas 引擎自带的开源 gizmo extras（与视口同一引擎，零新增依赖），
 * 手柄会直接改写挂载节点的 transform，业务侧只需在拖拽结束时读回数值。
 */
export type Blocking3dTransformTool = "translate" | "rotate" | "scale";

export interface Blocking3dTransformGizmoCallbacks {
  onTransformStart?: () => void;
  onTransformMove?: () => void;
  onTransformEnd?: () => void;
}

export interface Blocking3dTransformGizmoRuntime {
  /** 切换当前工具；null 表示关闭全部手柄。 */
  setTool: (tool: Blocking3dTransformTool | null) => void;
  getTool: () => Blocking3dTransformTool | null;
  /** 把手柄挂到目标节点；null 收回。重复挂同一节点为无操作。 */
  attach: (node: pc.GraphNode | null) => void;
  /** 指针当前是否悬停 / 按在手柄上，用于抑制页面自身的拾取与相机拖拽。 */
  isPointerOnGizmo: () => boolean;
  isDragging: () => boolean;
  destroy: () => void;
}

export function createBlocking3dTransformGizmo(
  app: pc.AppBase,
  camera: pc.CameraComponent,
  callbacks: Blocking3dTransformGizmoCallbacks = {},
): Blocking3dTransformGizmoRuntime {
  const layer = pc.Gizmo.createLayer(app, "Gizmo");
  const gizmos = {
    translate: new pc.TranslateGizmo(camera, layer),
    rotate: new pc.RotateGizmo(camera, layer),
    scale: new pc.ScaleGizmo(camera, layer),
  } as const;
  // 布局数据模型只保存 yawDeg；旋转手柄只留 Y 轴圆环，避免拖出无法落库的 X/Z 旋转。
  gizmos.rotate.enableShape("x", false);
  gizmos.rotate.enableShape("z", false);
  gizmos.rotate.enableShape("xyz", false);
  // 缩放只允许整体等比：禁用单轴手柄，只保留中心等比手柄。
  gizmos.scale.enableShape("x", false);
  gizmos.scale.enableShape("y", false);
  gizmos.scale.enableShape("z", false);

  let activeTool: Blocking3dTransformTool | null = null;
  let attachedNode: pc.GraphNode | null = null;
  let pointerOnGizmo = false;
  let dragging = false;

  for (const gizmo of Object.values(gizmos)) {
    gizmo.on(pc.Gizmo.EVENT_POINTERDOWN, (_x: number, _y: number, meshInstance: unknown) => {
      if (meshInstance) pointerOnGizmo = true;
    });
    gizmo.on(pc.Gizmo.EVENT_POINTERMOVE, (_x: number, _y: number, meshInstance: unknown) => {
      pointerOnGizmo = Boolean(meshInstance);
    });
    gizmo.on(pc.Gizmo.EVENT_POINTERUP, () => {
      pointerOnGizmo = false;
    });
    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMSTART, () => {
      dragging = true;
      callbacks.onTransformStart?.();
    });
    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMMOVE, () => {
      callbacks.onTransformMove?.();
    });
    gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMEND, () => {
      dragging = false;
      pointerOnGizmo = false;
      callbacks.onTransformEnd?.();
    });
  }

  const applyTool = () => {
    for (const [tool, gizmo] of Object.entries(gizmos)) {
      if (tool === activeTool && attachedNode) {
        gizmo.attach(attachedNode);
      } else {
        gizmo.detach();
      }
    }
  };

  return {
    setTool(tool) {
      activeTool = tool;
      applyTool();
    },
    getTool: () => activeTool,
    attach(node) {
      if (node === attachedNode) return;
      attachedNode = node;
      applyTool();
    },
    isPointerOnGizmo: () => pointerOnGizmo,
    isDragging: () => dragging,
    destroy() {
      for (const gizmo of Object.values(gizmos)) gizmo.destroy();
    },
  };
}
