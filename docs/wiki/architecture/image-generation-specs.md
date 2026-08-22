# 生图规格规范（imageSpecs 单一来源）

## 背景 / 决策

各生图场景的尺寸/画幅规范沿用旧项目 mydrama 的约定收敛而来：**设计参考类横版、阅读消费类竖版、头像类方图**。2026-08-19 之前各服务把 size 字符串散落硬编码（且角色资产图曾用 1024x1024 方图，与旧项目"道具参考图固定 16:9 横屏"不一致），现统一收敛到 `server/src/services/image/imageSpecs.ts`。

## 当前规则

| 规格 Key | 场景 | 画幅 | 语义 |
| --- | --- | --- | --- |
| `characterSheet` | 角色四视图/表情稿（漫画与漫剧） | 1536x1024 请求；Grok Build 归一化为 1280x720 | 横版：四视图按固定顺序并排，最终产物为 16:9 |
| `scenePanorama` | 场景 360° 全景参考图（状态图与旧版全景） | 2048x1024 请求（2:1 等距柱状） | 2:1 是 equirectangular 标准比例；只有 Codex 通道支持该比例，场景图统一走 Codex（2026-08-23 用户要求） |
| `characterAsset` | 服装/武器等角色资产设计参考图 | 1536x1024 | 横版：旧项目道具参考图固定横屏 |
| `dramaKeyframe` | 漫剧分镜首帧 | 1024x1536 | 竖版 2:3：竖屏阅读形态 |
| `comicPanelFallback` | 漫画分格兜底画幅 | 1024x1536 | 竖版：正式值跟随漫画模板 imageSize |
| `novelCover` | 小说封面 | 1024x1536 | 竖版：与 `shared/types/image.ts` 常量同源 |

- 生图服务**必须从 `IMAGE_SPECS` 取值**，不允许在服务内再硬编码尺寸字符串；新增生图场景先在 imageSpecs 里加 Key 再引用。
- 所有值必须在 `IMAGE_SIZES` 白名单（`services/image/types.ts`）内；provider 层把 size 映射为比例（如 1536x1024→3:2）传给对应通道。
- Grok Build 的图片桥会按 16:9 提示词生成并把最终文件归一化为 1280x720；因此角色四视图的 16:9 板式由 `characterStateSheet` 的提示词契约锁定，不能只看通用请求尺寸或把它误当成 PSD 输入。
- **透明底资产参考图（2026-08-22）**：角色四视图/状态图与道具图统一透明背景 PNG（`TRANSPARENT_IMAGE_OPTIONS`：background=transparent + output_format=png，仅 Codex 通道），提示词同步要求真 alpha 通道、禁止实底/棋盘格/地面；一切阅读消费类图片（首帧、封面、分格）保持不透明。
- **场景全景 2:1（2026-08-23 用户要求）**：等距柱状全景的标准比例是 2:1（此前 1536x1024/16:9 会造成球面贴图水平挤压）；`scenePanorama` 固定 2048x1024，场景图与角色/道具一样统一路由 Codex（grok_build 固定 1280x720 出不了 2:1）。前端场景状态图编辑器内置全景预览（拖拽环视/滚轮缩放，可切平面图，`client/src/components/common/PanoramaViewer.tsx`，无第三方依赖，参考 mydrama 的 photo-sphere-viewer 体验）。渲染按环境降级：WebGL→球面透视投影；WebGL 初始化失败→Canvas 2D 水平环视（左右无缝循环+滚轮缩放，**换新 canvas 元素**——一个 canvas 只能持一种上下文类型，降级复用旧元素会拿到 null 上下文）；连 2D 都没有才退静态图。**坑（2026-08-23 真因排查）**：应用包了 React StrictMode（开发模式 effect 双挂载）——cleanup 里调 `WEBGL_lose_context.loseContext()` 会在第二次挂载留下死上下文，着色器校验全失败后一路降级到静态图（表现为「图能看、完全不能拖」）；因此 cleanup **禁止杀上下文**，资源 delete 后交给页面生命周期回收。
- **改规格必须同步 UI 展示比例**：前端 `GeneratedImageCard` 有 `aspectRatio`（square/portrait/landscape），资产卡已传 landscape。
- 头像类（`ImageGenerationService` 的 character / book_analysis_character sceneType 默认 1024x1024）保持方图——展示位是圆形/方形头像框，不进 IMAGE_SPECS（它们是通用服务的调用方默认值，不是设计规范）。

## 契约锁定

`server/tests/imageSpecsContract.test.js` 断言横版/竖版分组与白名单校验；改画幅分组必须同步该测试与对应 UI。

## 失败模式 / 注意事项

- 漫画分格的正式画幅由项目 stylePreset.imageSize 决定（模板选择），`comicPanelFallback` 只是兜底；不要把分格画幅误解为全局固定。
- 旧图不会因规格变更重生成：已存在的方图资产保持原样，仅新生成按横版。

## 相关模块

- `server/src/services/image/imageSpecs.ts`（唯一来源）、`services/image/types.ts`（白名单）、`services/image/provider.ts`（size→比例映射）
- 消费方：`comic/ComicCharacterAssetService`、`drama/visual/DramaShotKeyframeService`（后续新生图入口同规则接入）
- `client/src/components/comic/GeneratedImageCard.tsx`（展示比例）
