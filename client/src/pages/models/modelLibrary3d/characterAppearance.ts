import * as pc from "playcanvas";

import {
  BLOCKING_3D_BLUE_ACTOR_COLOR,
  setEntityMaterial,
} from "@/pages/drama/comicDrama/components/blocking3d";

export const CHARACTER_TEXTURE_SIZE = 512 as const;
const CHARACTER_MODEL_HEIGHT_METERS = 1.83;

export type CharacterAppearanceMode = "blue" | "male-college-student";

export interface CharacterAppearanceController {
  readonly mode: CharacterAppearanceMode;
  setMode: (mode: CharacterAppearanceMode) => boolean;
  destroy: () => void;
}

/**
 * UAL2 角色代理没有可用的展开 UV：两个 primitive 的 UV 都退化为同一个点。
 * 这个材质只用于模型库的可行性测试，按模型世界位置做圆柱投影，让服装色块
 * 能够先在现有骨架上验证；生产角色纹理仍需要带有效 UV 的角色资产。
 */
export const CHARACTER_TEXTURE_DIFFUSE_CHUNK = [
  "uniform sampler2D characterTexture;",
  "void getAlbedo() {",
  "    float u = fract(atan(vPositionW.z, vPositionW.x) / 6.28318530718 + 0.5);",
  "    float v = clamp(vPositionW.y / 1.83, 0.0, 1.0);",
  "    dAlbedo = texture2D(characterTexture, vec2(u, v)).rgb;",
  "}",
].join("\n");

type Rgb = [number, number, number];

const COLLEGE_PALETTE = {
  shoe: [0.92, 0.93, 0.9] as Rgb,
  sole: [0.12, 0.14, 0.18] as Rgb,
  denim: [0.08, 0.18, 0.34] as Rgb,
  jacket: [0.12, 0.28, 0.52] as Rgb,
  jacketLight: [0.35, 0.58, 0.82] as Rgb,
  shirt: [0.88, 0.91, 0.88] as Rgb,
  skin: [0.72, 0.42, 0.28] as Rgb,
  skinLight: [0.92, 0.64, 0.45] as Rgb,
  hair: [0.06, 0.045, 0.035] as Rgb,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scaleRgb(color: Rgb, amount: number): Rgb {
  return [
    clamp01(color[0] * amount),
    clamp01(color[1] * amount),
    clamp01(color[2] * amount),
  ];
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * 生成确定性的男大学生服装色块。所有像素都由坐标计算，没有随机数，
 * 因而模型卡片和详情页每次都能得到相同的参考外观。
 */
function createCollegeStudentTexture(app: pc.AppBase): pc.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = CHARACTER_TEXTURE_SIZE;
  canvas.height = CHARACTER_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建角色测试纹理画布。");

  const image = context.createImageData(CHARACTER_TEXTURE_SIZE, CHARACTER_TEXTURE_SIZE);
  const pixels = image.data;
  for (let y = 0; y < CHARACTER_TEXTURE_SIZE; y += 1) {
    const height = 1 - y / (CHARACTER_TEXTURE_SIZE - 1);
    for (let x = 0; x < CHARACTER_TEXTURE_SIZE; x += 1) {
      const u = x / (CHARACTER_TEXTURE_SIZE - 1);
      const weave = 0.96 + (
        Math.sin(x * 0.31)
        + Math.sin(y * 0.17)
        + Math.sin((x + y) * 0.07)
      ) * 0.008;
      let color: Rgb;

      if (height < 0.045) {
        color = COLLEGE_PALETTE.sole;
      } else if (height < 0.13) {
        color = mixRgb(COLLEGE_PALETTE.shoe, COLLEGE_PALETTE.sole, (0.13 - height) / 0.085 * 0.18);
      } else if (height < 0.49) {
        color = COLLEGE_PALETTE.denim;
        if (Math.abs(u - 0.5) < 0.012) color = scaleRgb(color, 1.22);
      } else if (height < 0.76) {
        color = COLLEGE_PALETTE.jacket;
        if (u > 0.39 && u < 0.61 && height > 0.58) color = COLLEGE_PALETTE.shirt;
        if (u > 0.46 && u < 0.54 && height > 0.62 && height < 0.69) {
          color = COLLEGE_PALETTE.jacketLight;
        }
      } else if (height < 0.91) {
        color = COLLEGE_PALETTE.skinLight;
        if (u > 0.37 && u < 0.63 && height < 0.84) color = COLLEGE_PALETTE.shirt;
      } else {
        color = COLLEGE_PALETTE.hair;
        if (height < 0.95) color = mixRgb(COLLEGE_PALETTE.hair, COLLEGE_PALETTE.skin, 0.22);
      }

      const offset = color === COLLEGE_PALETTE.shirt ? 1 : weave;
      const pixel = (y * CHARACTER_TEXTURE_SIZE + x) * 4;
      pixels[pixel] = Math.round(clamp01(color[0] * offset) * 255);
      pixels[pixel + 1] = Math.round(clamp01(color[1] * offset) * 255);
      pixels[pixel + 2] = Math.round(clamp01(color[2] * offset) * 255);
      pixels[pixel + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new pc.Texture(app.graphicsDevice, {
    name: "character-college-student-test",
    width: CHARACTER_TEXTURE_SIZE,
    height: CHARACTER_TEXTURE_SIZE,
    format: pc.PIXELFORMAT_R8_G8_B8_A8,
    srgb: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    flipY: true,
  });
  texture.setSource(canvas);
  return texture;
}

function collectMeshInstances(entity: pc.Entity): pc.MeshInstance[] {
  const meshInstances = new Set<pc.MeshInstance>();
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const mesh of render.meshInstances ?? []) meshInstances.add(mesh);
  }
  for (const model of entity.findComponents("model") as pc.ModelComponent[]) {
    for (const mesh of model.meshInstances ?? []) meshInstances.add(mesh);
  }
  return [...meshInstances];
}

function createCollegeStudentMaterial(
  texture: pc.Texture,
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = "character-college-student-test-material";
  material.diffuse = new pc.Color(1, 1, 1);
  material.metalness = 0;
  material.gloss = 0.18;
  material.glossInvert = false;
  material.useLighting = true;
  material.useSkybox = true;
  material.setParameter("characterTexture", texture);
  material.shaderChunksVersion = pc.CHUNKAPI_1_57;
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set(
    "diffusePS",
    CHARACTER_TEXTURE_DIFFUSE_CHUNK,
  );
  material.update();
  return material;
}

export function createCharacterAppearanceController(
  app: pc.AppBase,
  entity: pc.Entity,
): CharacterAppearanceController {
  const meshInstances = collectMeshInstances(entity);
  let blueMaterial: pc.StandardMaterial | null = null;
  let texture: pc.Texture | null = null;
  let textureMaterial: pc.StandardMaterial | null = null;
  let currentMode: CharacterAppearanceMode = "blue";
  let destroyed = false;

  const applyMaterial = (material: pc.StandardMaterial) => {
    for (const mesh of meshInstances) mesh.material = material;
  };

  const ensureBlueMaterial = () => {
    if (!blueMaterial) blueMaterial = setEntityMaterial(entity, BLOCKING_3D_BLUE_ACTOR_COLOR);
    applyMaterial(blueMaterial);
    return blueMaterial;
  };

  const ensureTextureMaterial = () => {
    if (!texture) texture = createCollegeStudentTexture(app);
    if (!textureMaterial) textureMaterial = createCollegeStudentMaterial(texture);
    applyMaterial(textureMaterial);
    return textureMaterial;
  };

  return {
    get mode() {
      return currentMode;
    },
    setMode(mode) {
      if (destroyed) return false;
      if (mode === "blue") ensureBlueMaterial();
      else ensureTextureMaterial();
      currentMode = mode;
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      textureMaterial?.destroy();
      texture?.destroy();
      blueMaterial?.destroy();
      textureMaterial = null;
      texture = null;
      blueMaterial = null;
    },
  };
}
