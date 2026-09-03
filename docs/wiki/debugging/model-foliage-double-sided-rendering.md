# 透明植被模型的双面渲染诊断

## 背景

草、花、树叶等模型通常使用带透明通道的镂空贴图。它们的可见表面不是实体厚度，而是由一张或多张薄片组成；如果渲染器剔除背面，模型从反向观察时会只剩一部分，表现为“草只渲染了一半”。

典型复现是模型库详情页 `/models/wildflower-c`：模型文件本身和目录中的透明贴图都能加载，但旋转到反面后叶片缺失。

## 决策

共享材质入口 `modelMaterials.ts` 以目录材质映射中的 `opacity` 作为透明镂空信号：

- `opacity` 为非空路径时，材质使用 `pc.CULLFACE_NONE`，从正反两面渲染叶片和花瓣；
- 没有有效 `opacity` 映射时，材质使用 `pc.CULLFACE_BACK`，普通不透明模型继续保留背面剔除；
- 不修改 GLB、贴图、alpha cutoff 或深度行为，也不把透明标量 `opacityValue` 自动扩大为全库双面规则。

## 当前规则

所有模型材质都必须经过 `client/src/pages/models/modelLibrary3d/modelMaterials.ts` 的共享入口。该入口同时服务模型详情页、模型卡片缩略图和漫剧分镜前景模型，因此同一个透明材质的正反面行为必须在这里统一决定，不能由单个页面补丁覆盖。

新增或替换植被资产时，除了检查 alpha 通道、材质映射和预览图，还要从详情页旋转到反向视角，确认镂空片材仍然可见。普通实体道具则应保持单面渲染，避免无条件关闭背面剔除带来不必要的绘制开销。

## 诊断步骤

1. 读取模型目录条目的 `materials`，确认对应材质是否有非空 `opacity` 路径，并确认该贴图确实包含透明信息。
2. 检查运行时是否由共享材质入口重新创建了 `StandardMaterial`；导出文件里的材质设置不能替代运行时回填规则。
3. 在 PlayCanvas 中检查该材质的 `cull`：透明镂空应为 `pc.CULLFACE_NONE`，普通不透明材质应为 `pc.CULLFACE_BACK`。
4. 打开真实模型详情页，记录默认视角和旋转后的反向视角；再检查缩略图和分镜前景入口，确认三条消费者使用同一行为。
5. 若正反面都显示但出现整块背景，回到 alpha 通道、`alphaMode`、`opacity` 映射和纹理请求链路排查，不要用双面渲染掩盖透明贴图丢失。

## 失败模式

- **只改 GLB 材质不生效**：运行时会按目录映射创建新的 `StandardMaterial`，新材质默认使用背面剔除；必须在共享回填边界重新设置 `cull`。
- **把所有模型都设为双面**：会掩盖普通模型的材质问题，并增加不必要的绘制；双面策略只能由有效 `opacity` 映射触发。
- **只看正面缩略图**：薄片模型正面可能正常，反面仍缺失；透明植被的视觉审核必须包含一次反向视角。

## 相关模块

- `client/src/pages/models/modelLibrary3d/modelMaterialPolicy.ts`：透明材质背面剔除策略。
- `client/src/pages/models/modelLibrary3d/modelMaterials.ts`：共享材质创建与目录贴图回填入口。
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`：模型详情页消费者。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`：模型卡片缩略图消费者。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dForegroundModels.ts`：分镜前景模型消费者。

## 来源文档

- `docs/wiki/product/model-library.md`
- `docs/wiki/debugging/model-preview-alpha-and-import-gate.md`
- `client/src/pages/models/modelLibrary3d/modelMaterialPolicy.test.mjs`
