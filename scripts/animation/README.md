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

清单生成和前端目录生成必须按顺序执行：先完成
`build_animation_catalog_selection.cjs`，确认清单写入后再运行
`generate_animation_catalog_entries.cjs`；不要并行运行这两个命令，以免前端目录读到旧清单。

### Root motion 门禁

Cine57 导入目录采用严格的 root-motion 策选策略：只有扫描证据明确标记为
`RootMotion`/`Root` 路径或 `RM`/`Root` 资产名的片段才能进入清单；`InPlace` 优先排除，
不能用模糊的 `root` 文本、骨盆平移或“看起来像移动”的动作替代源证据。对话、战斗等
语义动作如果使用不同命名的 root-motion 对应资产，必须通过有限的显式候选映射选择，
不能无边界地猜测资产名。

组装链路还会逐级检查：源动画 GLB、重定向中间 GLB 和最终目录片段都必须包含名为
`root` 的节点平移通道。缺失该通道的片段会被丢弃并记录原因，不能回退到非 root-motion
版本。重新扩量前应先修正 UE 导出设置或源资产，再重新扫描、导出和组装。

当前目录中的旧兼容动作仍保留给已有分镜调用方；新生成的 Cine57 条目必须带有
`rootMotion: true` 及源证据，前端和分镜运行时共用同一份最终 GLB。

相关检查：

```text
node scripts/animation/rootMotionPolicy.test.cjs
node scripts/animation/animationCatalogSelection.test.cjs
node scripts/animation/verify_animation_catalog.cjs scripts/animation/animationCatalogSelection.json client/public/anims/cine57/UAL2_UE_Anims.glb
```
