import * as pc from "playcanvas";

/**
 * 模型库的棚拍布光：主光 + 补光 + 轮廓光 + 程序化环境反射 + ACES 色调映射。
 * 编辑器与缩略图工坊共用，保证卡片预览和 3D 编辑里看到的是同一套外观。
 * 色调映射在 2.21 里挂在相机组件上，需要传入已创建的 camera。
 */

/**
 * 程序化棚拍环境：竖向渐变的等距柱状图（顶部冷白天光、中性地面），运行时
 * 预滤波成引擎的 env atlas。没有环境反射时低粗糙度材质（玻璃、金属）会
 * 看起来发白发黑，这一步是它们质感成立的前提。失败时返回 null，布光退化为
 * 纯三灯方案。
 */
function createStudioEnvAtlas(app: pc.AppBase): pc.Texture | null {
  try {
    const width = 64;
    const height = 32;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const t = y / (height - 1); // 0 = 顶（天光方向）
      let r: number;
      let g: number;
      let b: number;
      if (t < 0.45) {
        // 顶部亮冷白，衰减到地平线
        const k = 1 - t / 0.45;
        r = 90 + 120 * k;
        g = 96 + 122 * k;
        b = 104 + 126 * k;
      } else {
        // 地平线以下快速压暗成深灰地面
        const k = Math.min(1, (t - 0.45) / 0.55);
        r = 66 - 46 * k;
        g = 70 - 48 * k;
        b = 76 - 50 * k;
      }
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    const source = new pc.Texture(app.graphicsDevice, {
      name: "studio-env-equirect",
      width,
      height,
      format: pc.PIXELFORMAT_R8_G8_B8_A8,
      mipmaps: false,
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    });
    const pixels = source.lock();
    new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).set(data);
    source.unlock();
    const atlas = pc.EnvLighting.generatePrefilteredAtlas(
      [source, source, source, source, source, source],
      { size: 256 },
    );
    source.destroy();
    return atlas;
  } catch {
    return null;
  }
}

export function setupStudioLighting(
  app: pc.AppBase,
  camera: pc.CameraComponent,
  options: { castShadows?: boolean } = {},
): void {
  camera.toneMapping = pc.TONEMAP_ACES;
  app.scene.exposure = 1.15;
  app.scene.ambientLight = new pc.Color(0.5, 0.52, 0.56);
  const envAtlas = createStudioEnvAtlas(app);
  if (envAtlas) app.scene.envAtlas = envAtlas;

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
