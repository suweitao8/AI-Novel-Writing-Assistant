# 动画目录细分类与分页实施计划

> 执行约束：在 `D:\Github\AI-Novel-Writing-Assistant-animation-taxonomy-pagination` 隔离 worktree 内完成；不改主 worktree，不调用外部 Chrome；完成自测后签名提交，并通过仓库集成入口合并推送。

## 1. 固化策选数据结构

**文件**：

- `scripts/animation/build_animation_catalog_selection.cjs`
- `scripts/animation/animationCatalogSelection.json`
- `scripts/animation/generate_animation_catalog_entries.cjs`
- `client/src/config/animationCatalogEntries.ts`

**工作**：

- 去掉五个 UE 组标签中的“虚幻”前缀。
- 为策选片段增加 `classificationId`、`classificationLabel`、`actorKind`、`posture`、`weaponType`，由套装默认值和混合套装的显式片段覆盖组成。
- 让选入清单覆盖弓箭、长枪与戟、剑、武士刀、刺剑、双刃、手枪、重锤、镰刀、匕首、徒手流派，以及怪物/生物地面动作。
- 生成器校验字段枚举、字段非空、每条 UE 记录真实 `/Game/` 路径和 Mannequin 骨架；重新生成前端目录。

## 2. 扩展目录筛选契约

**文件**：

- `client/src/config/animationLibrary.ts`
- `client/src/config/animationLibraryTaxonomy.test.mjs`

**工作**：

- 旧动画和 UE 条目都补齐分类字段。
- 增加按 `classificationId` 筛选，并让搜索命中分类标签、演员类型和姿态标签。
- 保留 `packId` 和套装元数据用于卡片与搜索，但不再把套装作为页面主筛选层。

## 3. 重做入口页交互

**文件**：

- `client/src/pages/animations/AnimationLibraryPage.tsx`
- `client/src/pages/animations/animationLibraryPage.test.mjs`（如现有测试结构需要则新增）

**工作**：

- 第一行来源组、第二行当前来源组的规范化分类，使用已有 Tabs/按钮和设计 token；两行均 `flex-nowrap` 横向滚动，避免四行换行。
- 移除套装 Select 和额外分类详情入口，卡片继续展示套装信息。
- 引入 `PAGE_SIZE = 24`，只对当前页条目执行 `AnimationCard` 映射；筛选/搜索变化回到第 1 页。
- 加入无障碍分页按钮、页码状态和结果数状态。

## 4. 文档与发布说明

**文件**：

- `docs/wiki/product/model-library.md`
- `docs/releases/release-notes.md`
- `README.md`

**工作**：

- 将动画分类从“来源 → 套装 → 动作类型”更新为“来源 → 规范化细分类”，记录静态策选和人形骨骼怪物边界。
- 按 release-note skill 检查用户可见范围，更新最新更新入口和完整发布记录。

## 5. 验证与交付

**命令**：

- 运行策选清单测试、动画目录测试和页面源码契约测试。
- 运行客户端 typecheck/build 或仓库规定的等价检查。
- 在 `http://127.0.0.1:5174/animations` 使用 Codex 内置浏览器验证两行筛选、默认 24 张、下一页、分类筛选回到第 1 页、搜索和预览；检查 console/network 无错误并保留关键截图。
- 检查生成文件、GLB 引用和工作树范围，签名提交后使用 `pnpm workflow:integrate codex/animation-taxonomy-pagination --push --verify ...` 合并推送，最后清理 worktree 并确认本地/远端 `main` 一致。
