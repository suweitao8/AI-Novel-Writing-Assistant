# 漫剧优先产品面清理实施计划

> 设计依据：`docs/superpowers/specs/2026-09-02-drama-first-product-surface-cleanup-design.md`

## 目标

把前端可访问产品面收敛到漫剧及必要支撑页面，避免旧小说/独立漫画/通用创作页面继续被加载，同时保留漫剧依赖的服务端接口、共享组件、历史数据和兼容 API。

## 执行步骤

### 1. 建立图片生成共享类型边界

涉及文件：

- 新增 `client/src/api/media/imageGenerationTypes.ts`
- 更新 `client/src/api/media/drama.ts`
- 更新 `client/src/api/bookAnalysis.ts`
- 更新 `client/src/components/image/useImageGenerationFlow.ts`
- 更新 `client/src/components/image/ImageGenerationConfirmDialog.tsx`
- 更新 `client/src/pages/drama/components/DramaVisualPanel.tsx`
- 更新 `client/src/api/media/comic.ts`

将 `ImageGenerationPreview` 与 `ImageGenerationOverrides` 迁移到图片生成能力自己的类型模块。`comic.ts` 通过 type re-export 保持兼容，独立漫画 API 不因共享类型拆分而改变响应和调用路径。

### 2. 收敛路由入口

涉及文件：

- 更新 `client/src/router/index.tsx`
- 新增或在路由文件内定义带 `novelId` 的旧地址重定向组件
- 更新相关路由合同测试

移除旧页面 lazy import，保留以下兼容跳转：

- 根路径、独立漫画、通用小说编辑/创建、创作中枢、拆书、世界样本、写法/规则/标题/题材/推进模式、基础角色、提示词工作台、导演跟进等旧路径跳转 `/drama`。
- `/novels/:id/edit`、`/novels/:id/chapters/:chapterId`、`/novels/:id/preview` 等带项目 id 的旧地址跳转 `/drama/studio/:id`。
- 保留 `/knowledge`、模型、动画、任务和系统设置路由。
- 保留 `/art-style` 到系统画风设置的兼容别名。

不再让任何旧页面组件进入 Vite 的动态导入图。

### 3. 清理桌面与移动端旧导航

涉及文件：

- 更新 `client/src/components/layout/Sidebar.tsx`
- 更新 `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- 更新 `client/src/components/layout/mobile/MobileSiteShell.tsx`
- 更新 `client/src/config/dramaFocusNav.ts`

桌面和移动端只展示漫剧、模型、动画、任务、系统及必要的资料入口；移除“小说/开书/独立漫画/创作中枢”等旧入口和移动端旧页面标题。清理临时“恢复全部入口”的注释与无效过滤分支，但不影响系统设置页签和漫剧内部导航。

### 4. 删除高置信度孤立的独立漫画前端代码

删除前先用全仓库静态引用确认目标只由旧 `/comic` 路由使用，然后删除：

- `client/src/pages/comic/ComicWorkspacePage.tsx`
- `client/src/pages/comic/ComicProjectPage.tsx`
- `client/src/pages/comic/project/`
- `client/src/components/comic/GeneratedImageCard.tsx`

不删除 `client/src/api/media/comic.ts`、`server/src/modules/comic`、`server/src/services/comic`、`Comic*` Prisma 模型或迁移。

### 5. 增加回归保护

新增客户端路由/共享类型合同测试，覆盖：

- 旧入口不会重新引入旧页面 lazy import；
- 旧静态入口跳转 `/drama`；
- 带小说 id 的旧编辑入口跳转对应漫剧工作室；
- 漫剧与通用图片生成组件从新的共享类型模块导入；
- 旧漫画服务端 API 挂载和漫剧 API 挂载仍存在。

## 验证顺序

1. `pnpm --filter client typecheck`。
2. 运行新增合同测试及现有漫剧合同测试、3D/资产相关测试。
3. `pnpm --filter client build`，检查旧页面没有生成的动态入口。
4. 启动工作树自己的开发服务，使用内置浏览器访问 `/drama`、漫剧工作室、模型、动画、任务、知识库和系统设置。
5. 逐个访问旧路径，确认跳转结果、无控制台错误和网络失败。
6. 检查数据库文件未被修改，工作树只包含本阶段文件。

## 风险控制

- 不执行数据库删除、迁移重置、storage 清理或 API 删除。
- 不修改漫剧生成、音频、图片、3D viewer 和提示词逻辑。
- 若发现旧页面仍被漫剧或设置页面静态引用，保留对应文件并只移除其产品入口。
