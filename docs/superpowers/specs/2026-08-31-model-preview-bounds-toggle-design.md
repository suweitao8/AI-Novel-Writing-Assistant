# 模型详情包围盒显示开关设计

## Background

模型详情页目前会始终绘制蓝色包围盒线框。包围盒对查看模型尺寸有帮助，但默认常驻会遮挡模型外观，尤其在用户只想检查材质和结构时会造成视觉干扰。

## Goals

1. 将模型详情页包围盒线框改为中性灰色，降低对模型主体的干扰。
2. 在模型信息区域增加“显示包围盒”复选框。
3. 复选框默认关闭；用户勾选后显示包围盒，取消勾选后立即隐藏。
4. 显示开关只控制包围盒的绘制，不改变模型几何数据、模型变换、相机行为或通用 HDRI 设置。

## Non-goals

- 不允许模型旋转、位移或缩放；既有只读预览边界保持不变。
- 不新增包围盒颜色或可见性持久化配置；每次进入详情页默认隐藏。
- 不修改通用资产 HDRI 页面及其它模型、动画、场景预览的包围盒或环境行为。

## Design

### Viewer contract

`modelViewerApp.ts` 继续以当前实时计算的显示空间 AABB 作为唯一包围盒数据源，并将线框颜色集中定义为中性灰色。查看器内部维护 `boundsVisible`，初始值取 `ModelViewerOptions.showBounds`，缺省为 `false`。

`ModelViewer` 增加 `setBoundsVisible(visible: boolean)`。该方法只更新查看器内部的绘制开关；每帧仅在开关开启且 AABB 有效时调用 `drawWireAlignedBox`。线框仍然不挂载到模型节点、不参与拾取、不提供拖拽能力。

### Detail page interaction

`ModelEditorPage.tsx` 使用受控原生 checkbox，标签为“显示包围盒”，采用现有语义 token 样式和 `accent-primary`。页面维护当前会话的可见性状态，并在查看器完成加载后同步状态；用户切换复选框时立即调用 `setBoundsVisible`。开关不写入数据库或浏览器存储，因此重新进入页面仍为关闭状态。

复选框在查看器加载期间也可以操作，状态先由页面保存，查看器完成初始化后应用，避免异步加载期间出现无法表达用户选择的空档。该控件不改变“聚焦、复位视角、快照”和相机导航的既有行为。

## Failure handling

- 查看器未加载或模型没有有效 AABB 时，复选框仍可显示当前页面状态，但打开后不会绘制不存在的线框。
- 查看器初始化失败时沿用现有错误覆盖层；页面不保存或伪造包围盒状态。
- 可见性切换失败不会影响模型加载、材质回填或 HDRI 生命周期，因为它只参与渲染帧中的条件判断。

## Verification

- 合约测试确认线框使用灰色颜色、默认可见性为关闭、查看器暴露可见性 setter、详情页有可访问的复选框并调用 setter。
- 运行模型预览相关 focused tests、客户端 typecheck 和 build。
- 使用内置浏览器访问模型详情页：初始不显示线框，勾选后显示灰色线框，取消勾选后隐藏；确认模型信息、相机操作和只读边界仍正常，控制台无错误。

## Related modules

- `client/src/pages/models/ModelEditorPage.tsx`
- `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- `client/tests/modelPreviewReadonly.contract.test.js`
- `docs/wiki/architecture/model-preview-readonly.md`
