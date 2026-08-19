# 生图规格规范（imageSpecs 单一来源）

## 背景 / 决策

各生图场景的尺寸/画幅规范沿用旧项目 mydrama 的约定收敛而来：**设计参考类横版、阅读消费类竖版、头像类方图**。2026-08-19 之前各服务把 size 字符串散落硬编码（且角色资产图曾用 1024x1024 方图，与旧项目"道具参考图固定 16:9 横屏"不一致），现统一收敛到 `server/src/services/image/imageSpecs.ts`。

## 当前规则

| 规格 Key | 场景 | 画幅 | 语义 |
| --- | --- | --- | --- |
| `characterSheet` | 角色四视图/表情稿（漫画与漫剧） | 1536x1024 | 横版：多视图并排时空间信息最全 |
| `scenePanorama` | 场景 360° 全景参考图 | 1536x1024 | 横版：一张全景覆盖整个空间 |
| `characterAsset` | 服装/武器等角色资产设计参考图 | 1536x1024 | 横版：旧项目道具参考图固定横屏 |
| `dramaKeyframe` | 漫剧分镜首帧 | 1024x1536 | 竖版 2:3：竖屏阅读形态 |
| `comicPanelFallback` | 漫画分格兜底画幅 | 1024x1536 | 竖版：正式值跟随漫画模板 imageSize |
| `novelCover` | 小说封面 | 1024x1536 | 竖版：与 `shared/types/image.ts` 常量同源 |

- 生图服务**必须从 `IMAGE_SPECS` 取值**，不允许在服务内再硬编码尺寸字符串；新增生图场景先在 imageSpecs 里加 Key 再引用。
- 所有值必须在 `IMAGE_SIZES` 白名单（`services/image/types.ts`）内；provider 层把 size 映射为比例（如 1536x1024→3:2）传给对应通道。
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
