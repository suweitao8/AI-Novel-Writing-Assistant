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
  /** 场景中的摄像机机身实体：可拾取、可拖拽、可挂变换手柄。 */
  readonly body: pc.Entity;
  /** 取景画中画实体：按机位 pose 渲染，选中摄像机或打开取景辅助时显示。 */
  readonly preview: pc.Entity;
  /** 机位、FOV 或显隐变化后统一调用；机身与画中画一次同步到位。 */
  sync(pose: Blocking3dShotCameraPose, fovDeg: number, previewVisible: boolean): void;
  /** 射线是否命中机身（含镜头），用于视口点选。 */
  rayHitsBody(ray: pc.Ray | null): boolean;
  destroy(): void;
}

export function createBlocking3dShotCamera(
  app: pc.AppBase,
  canvas: HTMLCanvasElement,
  editorCamera: pc.CameraComponent,
): Blocking3dShotCameraRuntime {
  const material = new pc.StandardMaterial();
  material.diffuse = BODY_COLOR;
  material.emissive = BODY_ACCENT;
  material.emissiveIntensity = 0.4;
  material.update();
  const body = new pc.Entity("blocking3d-camera-body");
  body.addComponent("render", { type: "box", material });
  const lens = new pc.Entity("blocking3d-camera-lens");
  lens.addComponent("render", { type: "box", material });
  lens.setLocalPosition(0, -0.05, -0.75);
  lens.setLocalScale(0.55, 0.55, 0.5);
  body.addChild(lens);
  body.setLocalScale(0.42, 0.26, 0.52);
  app.root.addChild(body);

  // 取景画中画与主相机共用图层（背景穹顶可见）并紧随其渲染优先级，压在主视口上层。
  const preview = new pc.Entity("blocking3d-shot-camera");
  preview.addComponent("camera", {
    clearColor: new pc.Color(0.02, 0.03, 0.05),
    fov: 52,
    nearClip: 0.05,
    farClip: 200,
  });
  const previewComponent = preview.camera!;
  previewComponent.layers = editorCamera.layers;
  previewComponent.priority = (editorCamera.priority ?? 0) + 1;
  // 取景小窗不挂 CameraFrame（无景深等整屏后效），只做纯净的取景呈现。
  previewComponent.rect = new pc.Vec4(0.575, 0.04, PIP_RECT_WIDTH, 0.225);
  preview.enabled = false;
  app.root.addChild(preview);

  return {
    body,
    preview,
    sync(pose, fovDeg, previewVisible) {
      body.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      body.setEulerAngles(pose.pitchDeg, pose.yawDeg, 0);
      preview.enabled = previewVisible;
      if (!previewVisible) return;
      previewComponent.fov = clamp(fovDeg, 10, 120);
      previewComponent.nearClip = 0.05;
      previewComponent.farClip = 200;
      const canvasAspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9;
      // PlayCanvas rect 以画布左下为原点：右下角留边对齐 Unity 的 camera preview。
      const heightFraction = clamp(PIP_RECT_WIDTH * canvasAspect * (9 / 16), 0.08, 0.8);
      previewComponent.rect = new pc.Vec4(0.975 - PIP_RECT_WIDTH, 0.03, PIP_RECT_WIDTH, heightFraction);
      preview.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      preview.setEulerAngles(pose.pitchDeg, pose.yawDeg, 0);
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
