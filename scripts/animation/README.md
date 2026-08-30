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
指定同一目标文件中的其他基准片段），使用世界空间姿态差：

```text
W_target = W_source_animation * inverse(W_source_bind) * W_target_standing_base
```

这样源文件即使以 A-Pose 或其他不同于 UAL2 T-Pose 的节点默认姿态导出，导入动作
也不会把目标角色的手臂重新放到水平 T-Pose。根/骨盆平移使用相对源绑定姿态的
增量并按绑定骨骼长度缩放，同时叠加到目标站立基准，坐姿的骨盆下降会留在角色
骨架附近，不会因为源/目标局部坐标分量不同而产生异常深度位移。

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
