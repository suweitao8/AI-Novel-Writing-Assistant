# 动画预览循环播放与帧轴同步设计

## Background

动画详情页的 PlayCanvas 动作层被固定配置为循环播放，但帧轴把
`activeStateCurrentTime` 转成整数帧时只做了边界裁剪。动作到达片段时长时，
姿态已经回到片段开头，帧轴却仍显示最后一帧，造成“动作在循环、当前帧停在末帧”
的错觉；页面也没有让用户选择一次播放还是循环播放的开关。

## Decision

1. 在动画预览器选项和运行时 API 中引入 `loop`，默认值为 `true`，保持现有动画预览的循环习惯。
2. “循环播放”使用现有 `Switch` 组件显示在播放控制区。预览器准备完成前开关禁用；切换时直接更新当前播放器，不重建 GLB、HDRI 或相机状态。
3. 循环模式把动作层时间按片段时长取模后再换算帧；时间恰好到达片段末尾时映射到第 0 帧，并保持播放状态。
4. 非循环模式把 `assignAnimation` 的 loop 参数设为 `false`。播放到时长边界后固定到最后一帧、暂停动作层，并把播放按钮状态同步为“播放动画”。
5. 切换循环模式时保留当前帧；帧轴继续使用现有的从 0 开始的编号约定，避免改变已保存关键帧和卡片预览图的含义。

## Runtime flow

```text
AnimLayer.activeStateCurrentTime
        -> loop-aware secondsToFrame()
        -> onFrameChange(frame, frameCount, frameRate, playing)
        -> React frame range + current-frame label
```

非循环模式额外在 PlayCanvas update 回调中检查动作层时间是否到达时长，统一写入
末帧并暂停；循环模式只规范化显示时间，不在每个 update 中抢写动画层时间，避免和
PlayCanvas 的循环采样相互争抢。

## Verification

- 单元测试覆盖：循环模式的精确时长映射到第 0 帧、末帧前仍显示最后一帧、非循环模式精确时长显示最后一帧。
- 源码契约测试覆盖：播放器使用可配置 loop、运行时切换 API、详情页 Switch 和切换回调。
- 内置浏览器回归覆盖：默认开关勾选；循环播放跨过边界后帧号重新从 0 开始且仍为播放中；关闭开关后播放到最后一帧并停止。

