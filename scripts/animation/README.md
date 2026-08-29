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

工具只把目标 `skins[].joints` 中的同名节点作为骨骼映射，使用世界空间绑定姿态差：

```text
W_target = W_source_animation * inverse(W_source_bind) * W_target_bind
```

根/骨盆平移使用相对源绑定姿态的增量并按绑定骨骼长度缩放。这样坐姿的骨盆下降会留在角色骨架附近，不会因为源/目标局部坐标分量不同而产生异常深度位移。

## 发布前检查

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

这个检查同时验证旋转 accessor 类型、单位四元数、skin joint 目标，以及待机、行走、坐姿的可见动作语义。替换发布 GLB 前必须看到该检查通过。
