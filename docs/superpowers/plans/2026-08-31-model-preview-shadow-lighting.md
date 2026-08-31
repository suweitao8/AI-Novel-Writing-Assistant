# 模型与动画预览阴影可读性实施计划

> 设计依据：`docs/superpowers/specs/2026-08-31-model-preview-shadow-lighting-design.md`

## 1. 先锁定失败行为

- 在 `blocking3dEnvironmentLighting.test.mjs` 增加纯函数测试：主光水平旋转 180° 时只翻转 X/Z，保持 Y、高度关系和方向长度；0°保持原向量。
- 在 `blocking3dEnvironmentLightingProfile.test.mjs` 和现有客户端契约测试中锁定 `model-preview` 的 180°偏转、`shadowIntensity = 0.62`。
- 在模型/动画缩略图相关测试中锁定 `castShadows: true`、shadow catcher 开启、移除 ACES 强制色调映射和新缓存版本。
- 先运行上述聚焦测试，确认现状因缩略图仍关闭阴影、动画 catcher 仍关闭、profile 尚未提供偏转而失败。

## 2. 实现共享主光策略

- 给 `Blocking3dLightingProfileConfig` 增加 `keyLightAzimuthOffsetDegrees`，默认 profile 为 0，模型 profile 为 180。
- 在环境光模块中实现可测试的水平旋转 helper，并由 `applyHdriKeyLight` 应用 profile 偏转；保持 HDRI estimator、envAtlas 和可见投影不变。
- 在环境运行时把当前 profile 的偏转传给主光应用函数。
- 将模型 profile 阴影强度调整为 0.62。

## 3. 统一两类卡片缩略图

- 模型缩略图使用 `castShadows: true`，移除 ACES 强制设置，缓存键更新为 v25。
- 动画缩略图使用 `castShadows: true`，传入 `model-preview` 并启用默认 shadow catcher，移除 ACES 强制设置，缓存键更新为 v11。
- 保持共享 HDRI 穹顶只接收阴影不投射阴影，确保主光不会被背景穹顶遮挡。

## 4. 文档与回归

- 更新模型预览光照架构 wiki、模型库产品规则中的缓存和阴影约束。
- 按发布流程更新 `docs/releases/release-notes.md` 和 README 的最新更新。
- 运行聚焦 Node 测试、客户端类型检查和客户端构建。
- 启动固定端口本地服务，在内置浏览器依次验收 `/models`、模型详情页、`/animations`：卡片缩略图重新生成且有清晰落地阴影，详情页仍可见，控制台无错误。

## 5. 交付

- 自检 diff、工作树状态和测试结果。
- 在隔离分支用 `git commit -s` 提交实现。
- 从干净 `main` 使用 `pnpm workflow:integrate codex/model-preview-shadow-lighting --push --verify "pnpm --filter @ai-novel/client typecheck"` 合并、推送。
- 验证本地 `main` 与 `origin/main` SHA 一致，清理本次工作树和本地分支，不触碰其他并行工作树。
