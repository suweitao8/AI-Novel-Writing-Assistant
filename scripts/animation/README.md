# 动画资源导出工具

这里维护从 UE/FBX 动画 GLB 到 UAL2 角色 GLB 的离线重定向边界。网页端只消费生成后的 GLB，不在 PlayCanvas 播放时修正源姿态。

## 导出前提

- UE `AnimSequence` 必须以绝对骨骼姿态导出；Additive、Layered 或只保存相对增量的片段必须先在 UE 侧烘焙到骨架参考姿态。
- 源动画 GLB 与目标 UAL2 GLB 必须使用同一套 glTF 坐标约定，并保留完整的骨骼名称。
- 导出后先抽查源动画绑定姿态与首帧差异，再运行客户端动画内容测试；“GLB 能打开”不足以证明动作正确。

## 重定向

```text
python scripts/animation/retarget_ual2.py <source.glb> <ual2.glb> <output.glb> <animation-name>
```

工具只把目标 `skins[].joints` 中的同名节点作为骨骼映射。默认从目标 UAL2 的
`Idle_No_Loop` 片段固定取 40% 时间点作为自然站立基准（也可通过最后一个参数
指定同一目标文件中的其他基准片段），先使用世界空间姿态差建立初始旋转：

```text
W_target = W_source_animation * inverse(W_source_bind) * W_target_standing_base
```

这样源文件即使以 A-Pose 或其他不同于 UAL2 T-Pose 的节点默认姿态导出，导入动作
也不会把目标角色的手臂重新放到水平 T-Pose。由于不同骨架的绑定姿态可能使用
不同的局部骨骼轴，初始旋转之后还必须把源动画中的主要解剖骨段（躯干、颈部、
锁骨、上臂、前臂和腿）逐帧对齐到目标的同名骨段；不能再用一个通用胸腔瞄准去
替代缺失的脊柱节，也不能对所有动作强制套末端 IK。根/骨盆平移使用相对源绑定
姿态的增量并按绑定骨骼长度缩放，同时叠加到目标站立基准，坐姿的骨盆下降会留在
角色骨架附近，不会因为源/目标局部坐标分量不同而产生异常深度位移。

末端 IK 只在源双手最小间距不超过 `0.15m` 时自动启用；需要接触点校正的特殊
动作可设置 `RETARGET_USE_LIMB_IK=1` 强制启用，`RETARGET_NO_ARM_IK=1` 始终关闭。

完整命令格式：

```text
python scripts/animation/retarget_ual2.py <source.glb> <ual2.glb> <output.glb> <animation-name> [target-pose-animation]
```

## 发布前检查

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

这个检查同时验证旋转 accessor 类型、单位四元数、skin joint 目标，以及待机、行走、坐姿的可见动作语义。替换发布 GLB 前必须看到该检查通过。

## Cine57 动画目录扩量

目录扩量先运行 `scan_cine57_animations.py` 生成 Asset Registry 证据，再运行
`build_animation_catalog_selection.cjs` 固化源组、套装、动作类型和 `dedupeKey`。
`generate_animation_catalog_entries.cjs` 将策选结果生成前端静态目录。UE 侧用
`export_cine57_animation_catalog.py` 按清单逐条导出 FBX，最后用
`assemble_animation_catalog.py` 串行完成 FBX → GLB → UAL2 重定向，并在复制到
`client/public/anims/cine57/` 前检查最终片段名集合。导出中不能把不同骨架的资产混入
同一链路，也不能用文件名猜测来替代扫描清单中的真实资产路径。

清单生成和前端目录生成必须按顺序执行：先完成
`build_animation_catalog_selection.cjs`，确认清单写入后再运行
`generate_animation_catalog_entries.cjs`；不要并行运行这两个命令，以免前端目录读到旧清单。

### 原地动画与位移门禁

Cine57 分镜目录默认需要“动作在原地播放、角色由分镜摆位控制移动”。策选时优先选择
UE 路径或资产名明确带有 `InPlace`、`IP`、`INP` 的源；明确位于 `RootMotion`/`Root`
路径，或资产名带独立 `RM`/`Root` 标记的源一律拒绝。没有显式标记但被精确策选的源可以
作为候选，不过不能凭文件名直接认定为原地，必须在转换成 GLB 后继续过数值门禁。

转换后的单片段 GLB 使用 `filter_animation_catalog_selection.cjs` 检查 `root` 节点的
translation 轨道：每个轴的最大范围和首尾净位移都必须不超过 `0.03m`。没有 `root`
translation 轨道表示没有可导出的全局根位移，视为通过；`pelvis` 的局部升降、下蹲和
跳跃姿态不属于全局位移，不能用骨盆轨道代替 root 判断。超限条目写入
`droppedClips` 和审计报告，源 FBX/GLB 不删除。

组装链路会再次检查源 GLB、重定向中间 GLB 和最终目录片段，避免缓存的旧中间结果绕过
门禁。重定向仍只向目标 `skins[].joints` 写入旋转/必要的根骨骼平移；最终验证还会检查
手臂骨链没有非有限值、断裂或超出可达长度的异常。通过的 Cine57 条目必须带有
`inPlace: true` 与 `inPlaceEvidence`，前端和分镜运行时共用同一份最终 GLB。

相关检查：

```text
node scripts/animation/inPlaceAnimationPolicy.test.cjs
node scripts/animation/animationCatalogSelection.test.cjs
python -m unittest scripts/animation/test_run_forward_retarget.py -v
node scripts/animation/filter_animation_catalog_selection.cjs \
  <candidate-selection.json> \
  D:/UnrealWorkspace/Cine57-exported/animation_catalog \
  <selection-output.json> \
  <root-translation-audit.json>
node scripts/animation/verify_animation_catalog.cjs scripts/animation/animationCatalogSelection.json client/public/anims/cine57/UAL2_UE_Anims.glb
```
