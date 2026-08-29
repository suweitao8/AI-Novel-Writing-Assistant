import * as pc from "playcanvas";

/**
 * 模型库的棚拍布光：主光 + 补光 + 轮廓光 + ACES 色调映射。
 * 编辑器与缩略图工坊共用，保证卡片预览和 3D 编辑里看到的是同一套外观。
 * 色调映射在 2.21 里挂在相机组件上，需要传入已创建的 camera。
 */
export function setupStudioLighting(
  app: pc.AppBase,
  camera: pc.CameraComponent,
  options: { castShadows?: boolean } = {},
): void {
  camera.toneMapping = pc.TONEMAP_ACES;
  app.scene.exposure = 1.15;
  app.scene.ambientLight = new pc.Color(0.5, 0.52, 0.56);

  // 主光：左前上方，负责形体与投影
  const keyLight = new pc.Entity("studio-key-light");
  keyLight.addComponent("light", {
    type: "directional",
    intensity: 1.7,
    castShadows: options.castShadows ?? false,
    shadowBias: 0.35,
    normalOffsetBias: 0.05,
    shadowDistance: 25,
    shadowResolution: 2048,
  });
  keyLight.setEulerAngles(48, 32, 0);
  app.root.addChild(keyLight);

  // 补光：右后上方弱光，抬亮暗面
  const fillLight = new pc.Entity("studio-fill-light");
  fillLight.addComponent("light", { type: "directional", intensity: 0.55 });
  fillLight.setEulerAngles(-30, -150, 0);
  app.root.addChild(fillLight);

  // 轮廓光：模型背后勾边，把主体从背景里剥出来
  const rimLight = new pc.Entity("studio-rim-light");
  rimLight.addComponent("light", { type: "directional", intensity: 0.85 });
  rimLight.setEulerAngles(18, 148, 0);
  app.root.addChild(rimLight);
}
