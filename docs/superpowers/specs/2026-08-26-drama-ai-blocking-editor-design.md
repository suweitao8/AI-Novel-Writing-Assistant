# 分镜 3D 草图编辑器内 AI 构图设计

## Background

分镜列表和 3D 草图编辑器目前各自暴露了 AI 摆位入口：列表中的「AI摆位」通过查询参数进入编辑器并触发模型调用，编辑器顶部又提供「AI 自动构图」。这会让同一个能力出现两个入口，也让打开编辑器本身可能触发有成本的 AI 请求。编辑器已经具备读取本镜角色、场景标记和镜头上下文，调用结构化自动构图 Prompt，并通过 PlayCanvas `loadLayout` 将角色、相机和景深应用到视口的完整能力，因此不需要再建立一条独立的摆位流程。

用户需要在编辑 3D 草图的同一个工作区内完成三件事：让 AI 设计本镜构图、直接查看当前镜头效果、检查并继续手动调整。镜头的景别、运镜、动作和 AI 构图说明也需要在编辑时可见，并在退出保存后继续保留。

## Goals

- 将 AI 摆位的唯一用户入口收敛到「编辑 3D 草图」页面。
- 打开 3D 草图页面只读取已有布局，不自动发起模型调用；只有用户点击编辑器中的 AI 按钮时才调用大模型。
- 将 AI 返回的角色位置、姿势、相机和景深立即应用到当前 PlayCanvas 视口，让用户看到当前分镜的镜头效果并继续编辑。
- 在编辑器内显示本镜的镜头信息和 AI 镜头设计说明；AI 说明随草图数据保存，重新进入时可以继续查看。
- 继续复用现有自动构图 API、结构化 Prompt、布局校验和退出时的 JSON + PNG + confirm 保存链路。
- AI 调用失败时保留当前布局和原有镜头设计说明，不离开编辑器，不产生半成品保存。

## Non-goals

- 不新增自动构图 API，不新增第二套 Prompt，不在分镜列表里嵌入 3D 视口。
- 不改变 PlayCanvas 的角色拖动、姿势、相机、景深和退出保存行为。
- 不让 AI 结果绕过用户检查直接确认或进入分镜生成链。
- 不把旧的 `autoPlan=1` 链接变成新的后台自动调用；旧链接最多兼容为普通编辑器入口。

## Design

### 1. 入口归属

`ShotVoiceListPanel` 保留「编辑3D」作为进入当前镜头编辑器的唯一摆位入口，移除列表旁独立的「AI摆位」按钮及其 `autoPlan=1` 导航。编辑器顶部保留一个 `AiButton`：

- 没有正在请求时显示「AI 自动构图」或「重新 AI 构图」。
- 请求期间显示「AI 构图中」，锁定视口相关操作和返回动作。
- 点击后调用已有 `autoPlanDramaShotBlockingSketch(projectId, shotId)`。

页面首次打开不会因为缺少 `layout3d` 或存在历史查询参数而自动调用模型。这样进入页面的行为只有读取和展示，AI 消耗由用户的显式点击控制。

### 2. AI 结果与当前镜头预览

服务端继续使用当前镜头的 `shotSize`、`cameraMove`、`durationSec`、`action`、`dialogue`、`visualPrompt`、场景环境/空间标记和全部出场角色调用结构化 Prompt。成功返回后，前端执行：

1. 校验结果已由服务端完成，使用现有 `viewer.loadLayout(result.data.layout)` 同时更新角色、姿势、相机和景深。
2. 视口立即显示新的相机画面，并在视口区域明确标注当前为「镜头预览」。
3. 把 `compositionNote` 放入当前编辑状态，显示在「镜头设计」面板。
4. 标记为「有未保存修改」，不上传 PNG、不确认，也不离开页面。

由于相机布局直接进入当前 viewer，用户看到的就是本镜 AI 设计后的镜头效果；用户随后拖动角色、调整相机或景深时，继续沿用现有编辑状态和退出保存流程。

失败时不调用 `loadLayout`，不覆盖已有 `compositionNote`，只显示错误反馈并保持当前编辑状态，允许再次点击 AI 按钮重试。

### 3. 镜头设计面板

编辑器右侧新增使用现有 Card、Badge 和排版 token 的「镜头设计」区域，包含：

- 当前镜头的景别、运镜、时长；
- 本镜动作和对白（有值时展示）；
- AI 返回的 `compositionNote`；没有 AI 说明时提供一个直接的「AI 自动构图」操作入口或空状态；
- 当前布局仍由 3D 视口实时呈现，现有相机控制区继续显示 FOV、景深和相机值。

面板不添加长篇原理说明，只显示任务相关的字段、操作状态和错误信息，符合新手低认知负担与现有 UI 文案规则。

### 4. 持久化契约

`DramaShotBlockingSketchData` 的 `compositionNote` 为可选字符串，兼容历史草图。编辑器保存时把当前说明和 `layout3d` 一起写入现有 PUT 接口；服务端 schema、规范化契约和保存服务都接受并保留该字段。旧草图没有说明时继续正常读取和编辑。

编辑器上下文新增只读的 `shot` 摘要，服务端从当前 shot 提供 `order`、`location`、`shotSize`、`cameraMove`、`durationSec`、`action`、`dialogue` 和 `visualPrompt`。该摘要只用于编辑器展示和已有 AI 请求上下文，不改变 shot 数据库结构。

### 5. 数据流

```text
分镜列表
  └─ 编辑3D
       └─ 读取 editor context（已有 layout3d + shot 摘要）
            ├─ 有布局 → 只恢复并展示
            └─ 点击 AI 自动构图
                 └─ 现有结构化 auto-plan API
                      ├─ layout3d → PlayCanvas 当前镜头预览
                      └─ compositionNote → 镜头设计面板
                           └─ 用户检查/调整
                                └─ 返回时保存 JSON + PNG + confirm
```

## File responsibilities

- `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`：移除打开页面的自动调用，承接 AI 结果、镜头设计面板和 `compositionNote` 保存状态。
- `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`：删除列表级「AI摆位」入口，只保留编辑器导航和已有生图入口。
- `client/src/api/media/drama.ts`：扩展编辑器上下文 shot 摘要与草图 compositionNote 类型。
- `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`：扩展可选 compositionNote 的规范化数据合同。
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`：返回 shot 摘要，并在保存时保留 compositionNote。
- `server/src/modules/drama/http/dramaRoutes.ts`：允许 PUT 草图 schema 接收 compositionNote。
- `client/tests/dramaBlocking3dPage.contract.test.js`：覆盖无打开即自动调用、编辑器显式调用和说明保存行为。
- `client/tests/shotVoiceBlockingSketchEntry.test.js`：覆盖列表只保留编辑 3D 入口。
- `server/tests/dramaShotBlockingSketchContracts.test.mjs`、相关 service/route 测试：覆盖上下文摘要和 compositionNote 往返。
- `docs/wiki/workflows/drama-blocking-3d.md`：记录入口归属、显式 AI 调用和镜头设计持久化规则。
- `docs/releases/release-notes.md`、`README.md`：记录用户可见的工作流变化。

## Verification

- 先用契约测试证明：初次打开不再读取 `autoPlan` 并自动请求；点击编辑器按钮仍调用已有 API，成功结果应用为未保存布局并展示说明；列表不再生成 `autoPlan=1` 链接。
- 服务端测试证明：editor context 返回 shot 摘要；带 `compositionNote` 的保存数据经过 schema 和规范化后仍可读取。
- 运行客户端类型检查/构建和服务端相关测试。
- 在真实浏览器中打开 3D 草图页面，确认不点击 AI 时没有“构图中”状态；点击编辑器 AI 按钮后确认当前镜头视口更新、镜头设计面板出现，并检查控制台无新增错误。
