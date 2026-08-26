import * as pc from "playcanvas";

const OUTLINE_LAYER_NAME = "blocking3d-selection-outline";
const OUTLINE_CAMERA_PRIORITY = -1;

export interface Blocking3dSelectionOutlineRuntime {
  setEntity: (entity: pc.Entity | null) => void;
  getEntity: () => pc.Entity | null;
  frameUpdate: () => void;
  destroy: () => void;
}

/**
 * Creates an editor-only screen-space outline renderer for one selected actor.
 *
 * The outline layer is intentionally kept out of the main camera's layer list.
 * OutlineRenderer samples the selected actor from this layer, then composites
 * the silhouette over the main camera at the Immediate layer. This avoids
 * drawing the actor twice in the regular scene and keeps the feedback tied to
 * the model's actual visible silhouette rather than to an AABB.
 */
export function createBlocking3dSelectionOutline(
  app: pc.AppBase,
  cameraEntity: pc.Entity,
  color: pc.Color,
): Blocking3dSelectionOutlineRuntime {
  const renderingLayer = new pc.Layer({
    name: OUTLINE_LAYER_NAME,
    opaqueSortMode: pc.SORTMODE_NONE,
  });
  app.scene.layers.insertOpaque(renderingLayer, 0);
  const renderer = new pc.OutlineRenderer(app, renderingLayer, OUTLINE_CAMERA_PRIORITY);
  let selectedEntity: pc.Entity | null = null;
  let destroyed = false;

  const setEntity = (entity: pc.Entity | null): void => {
    if (destroyed || selectedEntity === entity) return;
    if (selectedEntity) renderer.removeEntity(selectedEntity);
    selectedEntity = entity;
    renderer.outlineCameraEntity.enabled = Boolean(entity);
    if (entity) renderer.addEntity(entity, color);
  };

  const frameUpdate = (): void => {
    if (destroyed || !selectedEntity) return;
    const blendLayer = app.scene.layers.getLayerById(pc.LAYERID_IMMEDIATE);
    if (!blendLayer) return;
    renderer.frameUpdate(cameraEntity, blendLayer, false);
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    if (selectedEntity) renderer.removeEntity(selectedEntity);
    selectedEntity = null;
    renderer.outlineCameraEntity.enabled = false;
    renderer.destroy();
    app.scene.layers.removeOpaque(renderingLayer);
  };

  return {
    setEntity,
    getEntity: () => selectedEntity,
    frameUpdate,
    destroy,
  };
}
