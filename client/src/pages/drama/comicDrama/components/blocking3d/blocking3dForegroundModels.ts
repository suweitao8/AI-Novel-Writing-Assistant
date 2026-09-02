import * as pc from "playcanvas";

import type { StoryScene3DForegroundModel } from "@ai-novel/shared/types/comicDrama";
import { getModelLibraryEntry } from "@/config/modelLibrary";
import { applyModelMaterials } from "@/pages/models/modelLibrary3d/modelMaterials";
import { loadAsset, type ContainerResource } from "./blocking3dViewerCore";

interface SourceBounds {
  center: [number, number, number];
  halfExtents: [number, number, number];
}

function computeSourceBounds(entity: pc.Entity): SourceBounds | null {
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const corner = new pc.Vec3();
  let found = false;
  for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
    for (const meshInstance of render.meshInstances ?? []) {
      const aabb = meshInstance.mesh?.aabb;
      const world = meshInstance.node?.getWorldTransform();
      if (!aabb || !world) continue;
      for (let ix = -1; ix <= 1; ix += 2) {
        for (let iy = -1; iy <= 1; iy += 2) {
          for (let iz = -1; iz <= 1; iz += 2) {
            corner.set(
              aabb.center.x + ix * aabb.halfExtents.x,
              aabb.center.y + iy * aabb.halfExtents.y,
              aabb.center.z + iz * aabb.halfExtents.z,
            );
            world.transformPoint(corner, corner);
            min[0] = Math.min(min[0], corner.x);
            min[1] = Math.min(min[1], corner.y);
            min[2] = Math.min(min[2], corner.z);
            max[0] = Math.max(max[0], corner.x);
            max[1] = Math.max(max[1], corner.y);
            max[2] = Math.max(max[2], corner.z);
            found = true;
          }
        }
      }
    }
  }
  if (!found) return null;
  return {
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    halfExtents: [
      (max[0] - min[0]) / 2,
      (max[1] - min[1]) / 2,
      (max[2] - min[2]) / 2,
    ],
  };
}

export interface Blocking3dForegroundModelRuntime {
  readonly id: string;
  readonly entity: pc.Entity;
  readonly radiusMeters: number;
  getModel: () => StoryScene3DForegroundModel;
  getTransform: () => {
    position: [number, number, number];
    yawDeg: number;
    scale: number;
  };
  update: (model: StoryScene3DForegroundModel) => void;
  destroy: () => void;
}

/**
 * 把一个模型库条目实例化到 blocking 场景。模型的米制换算、底部落地和
 * 材质回填集中在这里，viewer 只负责选择、变换和持久化，不把模型当成 HDRI。
 */
export async function createBlocking3dForegroundModelRuntime(
  app: pc.AppBase,
  parent: pc.Entity,
  model: StoryScene3DForegroundModel,
): Promise<Blocking3dForegroundModelRuntime> {
  const entry = getModelLibraryEntry(model.modelId);
  if (!entry) throw new Error(`模型库中不存在“${model.modelId}”。`);

  const asset = await loadAsset(app, entry.fileUrl, "container");
  const resource = asset.resource as ContainerResource;
  const inner = resource.instantiateRenderEntity?.({ castShadows: true });
  if (!inner) {
    asset.unload();
    app.assets.remove(asset);
    throw new Error(`模型“${model.modelName}”没有可显示的网格。`);
  }

  const entity = new pc.Entity(`blocking3d-foreground-model-${model.id}`);
  const adjust = new pc.Entity("model-adjust");
  entity.addChild(adjust);
  adjust.addChild(inner);
  parent.addChild(entity);
  app.root.syncHierarchy();

  const unitScale = Number.isFinite(entry.unitScale) && entry.unitScale > 0
    ? entry.unitScale
    : 1;
  const bounds = computeSourceBounds(inner);
  adjust.setLocalScale(unitScale, unitScale, unitScale);
  let radiusMeters = 0.5;
  if (bounds) {
    adjust.setLocalPosition(
      -bounds.center[0] * unitScale,
      -(bounds.center[1] - bounds.halfExtents[1]) * unitScale,
      -bounds.center[2] * unitScale,
    );
    radiusMeters = Math.max(
      0.25,
      Math.hypot(...bounds.halfExtents) * unitScale,
    );
  }

  let currentModel = model;
  const updateTransform = () => {
    entity.setLocalPosition(
      currentModel.position[0],
      currentModel.position[1],
      currentModel.position[2],
    );
    entity.setLocalEulerAngles(0, currentModel.yawDeg, 0);
    entity.setLocalScale(currentModel.scale, currentModel.scale, currentModel.scale);
  };
  updateTransform();

  // GLB 里常见的是 FBX 材质占位；与模型库预览共用同一套材质回填。
  void applyModelMaterials(app, entity, entry.materials);

  return {
    id: model.id,
    entity,
    radiusMeters,
    getModel: () => currentModel,
    getTransform: () => {
      const position = entity.getPosition();
      const rotation = entity.getEulerAngles();
      const scale = entity.getLocalScale();
      return {
        position: [position.x, position.y, position.z],
        yawDeg: Math.max(-180, Math.min(180, rotation.y)),
        scale: Math.max(0.1, Math.min(10, scale.x)),
      };
    },
    update(nextModel) {
      currentModel = nextModel;
      updateTransform();
    },
    destroy() {
      entity.destroy();
      asset.unload();
      app.assets.remove(asset);
    },
  };
}
