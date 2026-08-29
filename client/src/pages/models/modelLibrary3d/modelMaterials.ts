import * as pc from "playcanvas";

import type { ModelMaterialInfo, ModelMaterialMap } from "@/config/modelLibrary";
import { loadAsset } from "@/pages/drama/comicDrama/components/blocking3d";

/**
 * 模型材质回填：GLB 里只有 FBX 带出来的材质占位（白色无贴图），
 * 目录里按「材质资源名 → 贴图/颜色」给每个模型声明真实外观，
 * 这里在加载后逐 meshInstance 套回漫反射 / 自发光 / 镂空贴图。
 */

export type { ModelMaterialInfo, ModelMaterialMap };

function normalizeMaterialName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeMaterialMap(map: ModelMaterialMap | undefined): ModelMaterialMap {
  const out: ModelMaterialMap = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    out[normalizeMaterialName(key)] = value;
  }
  return out;
}

export async function applyModelMaterials(
  app: pc.AppBase,
  entity: pc.Entity,
  materials: ModelMaterialMap | undefined,
): Promise<void> {
  const normalized = normalizeMaterialMap(materials);
  if (Object.keys(normalized).length === 0) return;

  const textureCache = new Map<string, Promise<pc.Asset>>();
  const loadTexture = async (url: string): Promise<pc.Texture | null> => {
    let pending = textureCache.get(url);
    if (!pending) {
      pending = loadAsset(app as never, url, "texture");
      textureCache.set(url, pending);
    }
    try {
      return (await pending).resource as pc.Texture;
    } catch {
      return null;
    }
  };

  const meshInstances: pc.MeshInstance[] = [];
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    meshInstances.push(...(render.meshInstances ?? []));
  }

  const built = new Map<string, Promise<pc.StandardMaterial | null>>();
  const buildMaterial = async (info: ModelMaterialInfo): Promise<pc.StandardMaterial | null> => {
    const material = new pc.StandardMaterial();
    material.useLighting = true;
    if (info.baseColor) {
      const tex = await loadTexture(info.baseColor);
      if (tex) material.diffuseMap = tex;
    }
    if (info.tint) {
      // UE 的 tint 与 albedo 相乘（同款多色变体靠它区分），PlayCanvas 的
      // diffuse 与 diffuseMap 同样是相乘关系，直接设置即可。
      material.diffuse = new pc.Color(info.tint[0], info.tint[1], info.tint[2]);
    }
    if (info.opacity) {
      const tex = await loadTexture(info.opacity);
      if (tex) {
        material.opacityMap = tex;
        material.alphaTest = 0.45;
        material.blendType = pc.BLEND_NONE;
      }
    }
    if (info.normal) {
      const tex = await loadTexture(info.normal);
      if (tex) material.normalMap = tex;
    }
    if (info.rma) {
      // UE 的 RMA 打包只取 G 通道粗糙度（glossInvert 取反后即粗糙度）。
      // B 与 R 通道经全库审计不可用：这包资产的 ORM 语义与 glTF 约定不符
      // （地毯/岩石/布艺的 B≈0.7-1.0、砖炉≈0，无金属度规律；R 通道在平整
      // 表面也压到 0.36，当 AO 会把物件压暗）。金属观感由真 HDR 环境 +
      // 漫反射色承担；金属度与 AO 待接入校准过的 PBR 数据后再启用。
      // 另注意：引擎 metalnessMap/glossMap 的默认采样通道与 glTF 约定
      // 不一致（glTF 加载器自己显式设了通道），手动接图必须写死通道。
      const tex = await loadTexture(info.rma);
      if (tex) {
        material.glossMap = tex;
        material.glossMapChannel = "g";
        material.gloss = 1;
        material.glossInvert = true;
      }
    }
    // 纯材质图槽位（UE 里没有贴图参数的玻璃/铬金属/灯罩等）走标量声明。
    if (info.opacityValue !== undefined && info.opacityValue < 0.98) {
      material.blendType = pc.BLEND_NORMAL;
      material.opacity = info.opacityValue;
      material.depthWrite = true;
    }
    if (info.metallic !== undefined && info.metallic > 0) {
      material.useMetalness = true;
      material.metalness = info.metallic;
    }
    if (info.roughness !== undefined) {
      material.gloss = 1 - info.roughness;
      material.glossInvert = false;
    }
    if (info.emissive) {
      // 2.21 没有 useEmissive 开关，直接设 emissive 颜色即可点亮
      material.emissive = new pc.Color(info.emissive[0], info.emissive[1], info.emissive[2]);
    }
    material.update();
    return material;
  };

  const pending: Promise<unknown>[] = [];
  for (const meshInstance of meshInstances) {
    const key = normalizeMaterialName(meshInstance.material?.name);
    const info = normalized[key];
    if (!info) continue;
    // 同名材质只构建一次，但每个 meshInstance 都要赋值。
    if (!built.has(key)) built.set(key, buildMaterial(info));
    pending.push(
      built.get(key)!.then((material) => {
        if (material) meshInstance.material = material;
      }),
    );
  }
  await Promise.all(pending);
}
