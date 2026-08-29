import * as pc from "playcanvas";

import { loadAsset } from "@/pages/drama/comicDrama/components/blocking3d";

import {
  DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
  getStudioEnvironmentPreset,
  type StudioEnvironmentPresetId,
} from "./studioEnvironmentPresets";
import { STUDIO_PANORAMA_URL } from "./studioBackdrop";

/**
 * 模型库的棚拍布光：主光 + 补光 + 轮廓光 + 环境反射（真实 HDR，程序化兜底）
 * + ACES 色调映射。编辑器与缩略图工坊共用，保证卡片预览和 3D 编辑里看到的
 * 是同一套外观。色调映射在 2.21 里挂在相机组件上，需要传入已创建的 camera。
 */

/** 内置中性棚拍 HDRI（Poly Haven studio_small_03，CC0）。等距柱状 RGBE。 */
const STUDIO_ENV_URL = "/models/env/studio_small_03_1k.hdr";

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
    intensity: 1.2,
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
  fillLight.addComponent("light", { type: "directional", intensity: 0.35 });
  fillLight.setEulerAngles(-30, -150, 0);
  app.root.addChild(fillLight);

  // 轮廓光：模型背后勾边，把主体从背景里剥出来
  const rimLight = new pc.Entity("studio-rim-light");
  rimLight.addComponent("light", { type: "directional", intensity: 0.55 });
  rimLight.setEulerAngles(18, 148, 0);
  app.root.addChild(rimLight);
}

/** 从等距柱状环境图（HDR 或全景图）构建引擎 env atlas；失败返回 null。 */
async function tryBuildEnvAtlasFromUrl(
  app: pc.AppBase,
  url: string,
): Promise<{ atlas: pc.Texture; dispose: () => void } | null> {
  try {
    const asset = await loadAsset(app, url, "texture");
    const texture = asset.resource as pc.Texture;
    texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
    texture.minFilter = pc.FILTER_LINEAR;
    texture.magFilter = pc.FILTER_LINEAR;
    texture.mipmaps = false;
    texture.anisotropy = Math.max(1, Math.min(app.graphicsDevice.maxAnisotropy, 8));
    texture.addressU = pc.ADDRESS_REPEAT;
    texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
    const lightingSource = pc.EnvLighting.generateLightingSource(texture, { size: 128 });
    const atlas = pc.EnvLighting.generateAtlas(lightingSource, {
      size: 256,
      numReflectionSamples: 256,
      numAmbientSamples: 512,
    });
    lightingSource.destroy();
    return {
      atlas,
      dispose: () => {
        atlas.destroy();
        asset.unload();
      },
    };
  } catch {
    return null;
  }
}

/**
 * 用真实环境替换程序化环境：优先加载当前模型预览预设的 HDRI，失败再退到
 * 旧版全景图与内置棚拍 HDRI；都不可用时静默保留程序化环境（三灯方案不受
 * 影响）。同一预设会同时供可见穹顶与 env atlas 使用。
 * 返回的清理函数用于销毁加载出的纹理与 atlas（调用方销毁应用时调用）。
 */
export async function upgradeStudioEnvironment(
  app: pc.AppBase,
  presetId: StudioEnvironmentPresetId = DEFAULT_STUDIO_ENVIRONMENT_PRESET_ID,
): Promise<() => void> {
  const previousAtlas = app.scene.envAtlas;
  const preset = getStudioEnvironmentPreset(presetId);
  const urls = [preset.sourceUrl, STUDIO_PANORAMA_URL, STUDIO_ENV_URL].filter(
    (url, index, all) => all.indexOf(url) === index,
  );
  let env: { atlas: pc.Texture; dispose: () => void } | null = null;
  for (const url of urls) {
    env = await tryBuildEnvAtlasFromUrl(app, url);
    if (env) break;
  }
  if (!env) return () => {};
  const { atlas, dispose } = env;
  app.scene.envAtlas = atlas;
  // 环境 atlas 已接管环境光贡献，恒定环境光归零避免叠加过曝。
  app.scene.ambientLight = new pc.Color(0.02, 0.02, 0.022);
  return () => {
    if (app.scene.envAtlas === atlas) app.scene.envAtlas = previousAtlas;
    dispose();
  };
}
