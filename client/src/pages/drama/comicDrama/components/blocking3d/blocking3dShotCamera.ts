import * as pc from "playcanvas";

import type {
  DramaShotBlockingSketch3DCamera,
  DramaShotBlockingSketch3DShotCamera,
} from "@/api/media/drama";
import { resolveBlocking3dOrbitPosition } from "./blocking3dCameraGizmo";

/**
 * Unity 风格的场景摄像机运行时：场景里常驻的机身实体 + 右下角取景画中画，
 * 共用一个独立于编辑视角的机位 pose（世界坐标位置 + 朝向）。编辑视角导航
 * 不会带动机身；拖拽机身、变换手柄或属性面板改写的都是 pose 本身，取景
 * 画中画始终渲染「这台摄像机拍到的草图内容」。
 *
 * 图层归属：机身渲染在编辑器辅助图层（画中画不渲染，否则取景相机会被
 * 自己的机身挡住）；画中画只渲染世界内容 + 专属的三分构图线图层。
 */

export interface Blocking3dShotCameraPose {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
}

export const BLOCKING_3D_SHOT_CAMERA_LIMITS = {
  positionX: { min: -100, max: 100 },
  positionY: { min: 0, max: 50 },
  positionZ: { min: -100, max: 100 },
  yawDeg: { min: -180, max: 180 },
  pitchDeg: { min: -89, max: 89 },
} as const;

const BODY_COLOR = new pc.Color(0.13, 0.16, 0.2);
const BODY_ACCENT = new pc.Color(0.16, 0.82, 1);
/** 取景画中画宽度占视口比例；高度按窗口纵横比换算出 16:9 画幅。 */
const PIP_RECT_WIDTH = 0.4;
/** 三分构图线颜色：半透明白，压在画面上但不抢内容。 */
const COMPOSITION_GUIDE_COLOR = new pc.Color(1, 1, 1, 0.45);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 把保存或加载的机位 pose 收敛到可渲染范围；结构缺失时回退到 fallback。 */
export function normalizeShotCameraPose(
  input: unknown,
  fallback: Blocking3dShotCameraPose,
): Blocking3dShotCameraPose {
  const pose = input as Partial<DramaShotBlockingSketch3DShotCamera> | null;
  if (!pose || !Array.isArray(pose.position) || pose.position.length !== 3) {
    return { position: [...fallback.position], yawDeg: fallback.yawDeg, pitchDeg: fallback.pitchDeg };
  }
  const [x, y, z] = pose.position.map((value) => Number(value));
  const yawDeg = Number(pose.yawDeg);
  const pitchDeg = Number(pose.pitchDeg);
  const fallbackPose = { position: [...fallback.position] as [number, number, number], yawDeg: fallback.yawDeg, pitchDeg: fallback.pitchDeg };
  if (![x, y, z].every((value) => Number.isFinite(value))) return fallbackPose;
  return {
    position: [
      clamp(x, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionX.min, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionX.max),
      clamp(y, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionY.min, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionY.max),
      clamp(z, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionZ.min, BLOCKING_3D_SHOT_CAMERA_LIMITS.positionZ.max),
    ],
    yawDeg: Number.isFinite(yawDeg)
      ? clamp(yawDeg, BLOCKING_3D_SHOT_CAMERA_LIMITS.yawDeg.min, BLOCKING_3D_SHOT_CAMERA_LIMITS.yawDeg.max)
      : fallbackPose.yawDeg,
    pitchDeg: Number.isFinite(pitchDeg)
      ? clamp(pitchDeg, BLOCKING_3D_SHOT_CAMERA_LIMITS.pitchDeg.min, BLOCKING_3D_SHOT_CAMERA_LIMITS.pitchDeg.max)
      : fallbackPose.pitchDeg,
  };
}

/** 旧布局只存编辑轨道相机：机位 pose 从轨道机位（位置即轨道点、朝向即方位/俯仰）推导。 */
export function deriveShotCameraPoseFromOrbit(camera: DramaShotBlockingSketch3DCamera): Blocking3dShotCameraPose {
  const position = resolveBlocking3dOrbitPosition(camera);
  return {
    position: [position.x, position.y, position.z],
    yawDeg: camera.azim,
    pitchDeg: camera.elev,
  };
}

export interface Blocking3dShotCameraRuntime {
  /** 场景中的摄像机机身实体：可拾取、可拖拽、可挂变换手柄（仅编辑视角可见）。 */
  readonly body: pc.Entity;
  /** 取景画中画实体：按机位 pose 渲染，选中摄像机或打开取景辅助时显示。 */
  readonly preview: pc.Entity;
  /** 机位、FOV 或显隐变化后统一调用；机身与画中画一次同步到位。 */
  sync(pose: Blocking3dShotCameraPose, fovDeg: number, previewVisible: boolean): void;
  /** 画中画可见时每帧调用：在画中画视口内绘制三分构图线（2 横 2 竖）。 */
  drawCompositionGuides(app: pc.AppBase): void;
  /** 射线是否命中机身（含镜头），用于视口点选。 */
  rayHitsBody(ray: pc.Ray | null): boolean;
  destroy(): void;
}

export function createBlocking3dShotCamera(
  app: pc.AppBase,
  canvas: HTMLCanvasElement,
  editorCamera: pc.CameraComponent,
  editorOnlyLayerId: number,
): Blocking3dShotCameraRuntime {
  const material = new pc.StandardMaterial();
  material.diffuse = BODY_COLOR;
  material.emissive = BODY_ACCENT;
  material.emissiveIntensity = 0.4;
  material.update();
  const body = new pc.Entity("blocking3d-camera-body");
  // 机身在编辑器辅助图层：取景相机的世界图层里没有它，预览不会被自己的机身挡住。
  body.addComponent("render", { type: "box", material, layers: [editorOnlyLayerId] });
  const lens = new pc.Entity("blocking3d-camera-lens");
  lens.addComponent("render", { type: "box", material, layers: [editorOnlyLayerId] });
  lens.setLocalPosition(0, -0.05, -0.75);
  lens.setLocalScale(0.55, 0.55, 0.5);
  body.addChild(lens);
  body.setLocalScale(0.42, 0.26, 0.52);
  app.root.addChild(body);

  // 三分构图线专用图层：只挂到取景相机上，编辑主视口不画。
  const compositionLayer = new pc.Layer({ name: "blocking3d-shot-composition" });
  app.scene.layers.insert(compositionLayer, app.scene.layers.layerList.length);

  // 取景画中画只渲染世界内容（布景、角色、HDRI 背景）+ 构图线图层：
  // 网格、边界圈、机位 gizmo 等编辑器辅助线都走 IMMEDIATE/辅助图层，不会混进预览。
  const preview = new pc.Entity("blocking3d-shot-camera");
  preview.addComponent("camera", {
    clearColor: new pc.Color(0.02, 0.03, 0.05),
    fov: 52,
    nearClip: 0.05,
    farClip: 200,
    layers: [pc.LAYERID_WORLD, compositionLayer.id],
  });
  const previewComponent = preview.camera!;
  previewComponent.priority = (editorCamera.priority ?? 0) + 1;
  // 取景小窗不挂 CameraFrame（无景深等整屏后效），只做纯净的取景呈现。
  previewComponent.rect = new pc.Vec4(0.575, 0.04, PIP_RECT_WIDTH, 0.225);
  preview.enabled = false;
  app.root.addChild(preview);

  let lastFovDeg = 52;
  let lastAspect = 16 / 9;

  return {
    body,
    preview,
    sync(pose, fovDeg, previewVisible) {
      body.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      body.setEulerAngles(pose.pitchDeg, pose.yawDeg, 0);
      preview.enabled = previewVisible;
      if (!previewVisible) return;
      lastFovDeg = fovDeg;
      previewComponent.fov = clamp(fovDeg, 10, 120);
      previewComponent.nearClip = 0.05;
      previewComponent.farClip = 200;
      const canvasAspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9;
      // PlayCanvas rect 以画布左下为原点：右下角留边对齐 Unity 的 camera preview。
      const heightFraction = clamp(PIP_RECT_WIDTH * canvasAspect * (9 / 16), 0.08, 0.8);
      previewComponent.rect = new pc.Vec4(0.975 - PIP_RECT_WIDTH, 0.03, PIP_RECT_WIDTH, heightFraction);
      // 构图线必须匹配小窗的实际渲染纵横比，而不是整个画布的纵横比。
      lastAspect = (PIP_RECT_WIDTH * canvas.width) / (heightFraction * canvas.height);
      preview.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      preview.setEulerAngles(pose.pitchDeg, pose.yawDeg, 0);
    },
    drawCompositionGuides(app) {
      if (!preview.enabled) return;
      const transform = preview.getWorldTransform();
      const forward = transform.transformVector(new pc.Vec3(0, 0, -1));
      const right = transform.transformVector(new pc.Vec3(1, 0, 0));
      const up = transform.transformVector(new pc.Vec3(0, 1, 0));
      const distance = 1;
      const halfVertical = Math.tan((clamp(lastFovDeg, 10, 120) * pc.math.DEG_TO_RAD) / 2) * distance;
      const halfHorizontal = halfVertical * lastAspect;
      const center = preview.getPosition().clone().add(forward.clone().scale(distance));
      for (const offset of [-halfHorizontal / 3, halfHorizontal / 3]) {
        const x = right.clone().scale(offset);
        app.drawLine(
          center.clone().add(x).add(up.clone().scale(-halfVertical)),
          center.clone().add(x).add(up.clone().scale(halfVertical)),
          COMPOSITION_GUIDE_COLOR,
          false,
          compositionLayer,
        );
      }
      for (const offset of [-halfVertical / 3, halfVertical / 3]) {
        const y = up.clone().scale(offset);
        app.drawLine(
          center.clone().add(y).add(right.clone().scale(-halfHorizontal)),
          center.clone().add(y).add(right.clone().scale(halfHorizontal)),
          COMPOSITION_GUIDE_COLOR,
          false,
          compositionLayer,
        );
      }
    },
    rayHitsBody(ray) {
      if (!ray || !body.enabled) return false;
      const hit = new pc.Vec3();
      for (const render of body.findComponents("render") as pc.RenderComponent[]) {
        for (const mesh of render.meshInstances ?? []) {
          if (mesh.aabb.intersectsRay(ray, hit)) return true;
        }
      }
      return false;
    },
    destroy() {
      preview.destroy();
      body.destroy();
    },
  };
}
