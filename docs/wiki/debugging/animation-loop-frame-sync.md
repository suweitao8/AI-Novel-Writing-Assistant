# 动画预览循环播放与帧轴同步

## Background

动画详情页使用 PlayCanvas 的 `AnimLayer` 播放 GLB 内的动作片段，并把
`activeStateCurrentTime` 换算为帧轴上的整数帧。动作片段的帧数按“第 0 帧到末帧”
计算，因此一个 1 秒、24 fps 的片段包含 25 个可选帧，末帧编号是 24。

## Decision

动画预览的循环是显式运行时状态，而不是固定写死在播放器里的行为。详情页默认打开
循环播放，并通过 `Switch` 允许用户切换到单次播放；切换只更新当前预览器，不重新创建
角色、HDRI 或相机。

循环模式下，PlayCanvas 的动作层时间到达片段时长后可能继续累加，或在渲染采样时处于
恰好等于时长的边界。UI 必须先按片段时长取模，再换算帧；因此恰好到达时长对应第 0
帧，动作仍保持播放中。单次播放则必须在 update 回调中检测时长边界，写入末帧并同时
暂停动作层和预览器状态，不能只依赖动作层自动停止。

## Current Rule

- `AnimationPreviewOptions.loop` 的默认值为 `true`，`AnimationPreview.isLooping()` 反映当前实际状态。
- `anim.assignAnimation` 的 loop 参数必须来自当前运行时状态，不能重新写回固定的 `true`。
- `secondsToFrame` 的循环分支只规范化显示时间；不要在每个 update 中抢写循环动作层时间，避免和 PlayCanvas 自己的采样发生竞争。
- 单次播放到达 `durationSeconds` 时，当前帧固定为 `frameCount - 1`，`anim.playing` 设为 `false`，并调用 `baseLayer.pause()`，随后通过 `onFrameChange` 一次性通知页面。
- `setLoop` 切换模式时要先读取当前帧，再重新装配当前片段并恢复该帧及原播放状态；这样开关不会造成角色跳帧或重置 HDRI 视角。
- 帧编号继续从 0 开始，保存的关键帧和动画卡片预览图沿用同一编号合同。

## Failure Modes

- 帧轴连续显示末帧，但动作仍在循环：检查 `secondsToFrame` 是否忘记传入 loop 状态，以及循环时是否按 duration 取模。
- 关闭循环后按钮仍显示播放中：检查 update 回调是否在精确时长边界显式设置 `anim.playing = false`，而不是等待 PlayCanvas 自己改变状态。
- 切换开关后角色回到起始姿态：检查 `setLoop` 是否在重新激活动作后恢复了切换前的整数帧。
- 只有刚好整秒时错帧：用 `seconds === duration` 和 `seconds < duration` 的单元测试分别覆盖循环与单次播放，避免只测普通播放中的中间帧。

## Related Modules

- `client/src/pages/animations/animationFrame.ts`：帧数、帧秒换算和循环显示时间规范化。
- `client/src/pages/animations/animationPreviewApp.ts`：PlayCanvas 动作层、运行时 loop 状态和播放结束边界。
- `client/src/pages/animations/AnimationPreviewPage.tsx`：详情页播放按钮、帧轴和“循环播放”开关。
- `client/src/pages/animations/animationPreviewApp.test.mjs`：预览器源码契约与运行时边界规则。

## Source Documents

- `docs/superpowers/specs/2026-09-01-animation-loop-frame-sync-design.md`
- `docs/superpowers/plans/2026-09-01-animation-loop-frame-sync.md`
