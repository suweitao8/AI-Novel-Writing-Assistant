import * as pc from "playcanvas";

const OUTLINE_LAYER_NAME = "blocking3d-selection-outline";
const OUTLINE_CAMERA_PRIORITY = -1;

// PlayCanvas OutlineRenderer 的合成通道只使用颜色的 RGB，alpha 完全被忽略；
// 描边透明度必须通过替换合成着色器、把边缘掩码 alpha 乘以不透明度系数实现。
const OUTLINE_BLEND_FRAGMENT_GLSL = `
varying vec2 vUv0;
uniform sampler2D source;
uniform float uOutlineOpacity;
void main(void)
{
  vec4 texel = texture2D(source, vUv0);
  gl_FragColor = vec4(texel.rgb, texel.a * uOutlineOpacity);
}
`;

const OUTLINE_BLEND_FRAGMENT_WGSL = `
varying vUv0: vec2f;
var source: texture_2d<f32>;
var sourceSampler: sampler;
uniform uOutlineOpacity: f32;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let texel = textureSample(source, sourceSampler, input.vUv0);
  output.color = vec4f(texel.rgb, texel.a * uniform.uOutlineOpacity);
  return output;
}
`;

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
 *
 * `color.a` becomes the outline opacity (defaults to fully opaque when unset).
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
  const opacity = Math.max(0, Math.min(1, color.a));
  const outlineBlendShader = pc.ShaderUtils.createShader(app.graphicsDevice, {
    uniqueName: "blocking3d-selection-outline-blend",
    attributes: {
      vertex_position: pc.SEMANTIC_POSITION,
    },
    vertexChunk: "fullscreenQuadVS",
    fragmentGLSL: OUTLINE_BLEND_FRAGMENT_GLSL,
    fragmentWGSL: OUTLINE_BLEND_FRAGMENT_WGSL,
  });
  app.graphicsDevice.scope.resolve("uOutlineOpacity").setValue(opacity);
  const defaultQuadRenderer = renderer.quadRenderer;
  renderer.quadRenderer = new pc.QuadRender(outlineBlendShader);
  defaultQuadRenderer.destroy();
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
    outlineBlendShader.destroy();
    app.scene.layers.removeOpaque(renderingLayer);
  };

  return {
    setEntity,
    getEntity: () => selectedEntity,
    frameUpdate,
    destroy,
  };
}
