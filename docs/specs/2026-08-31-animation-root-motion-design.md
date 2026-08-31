# Cine57 动画目录 Root Motion 资产契约

## Background

当前 Cine57 动画目录从 UE 扫描清单中选择人形骨骼动画，再导出 FBX、转换为 GLB，并重定向到 UAL2 骨架。原清单同时包含 `InPlace` 和带根位移的动画；前者在分镜 3D 草图中需要额外处理角色位移，容易出现“动作在播放但角色不走”的结果。

## Decision

Cine57 导入动画目录采用严格的 root-motion 策选规则：

1. 源资产必须能从 UE 资产路径或资产名得到明确的 root-motion 证据；`InPlace`、`In-Place`、`In_Place` 资产不进入 Cine57 可用目录。
2. 每条入选资产导出成单片段 GLB 后，必须存在目标节点为 `root` 的平移通道；没有 root 平移通道的导出结果直接失败，不允许通过标签或文件名兜底。
3. 当前策选动作没有对应 root-motion 源资产时，记录为被丢弃的候选，不回退到非 root-motion 版本。保留下来的套装只包含实际选中的 root-motion 片段。
4. 旧动画目录保持兼容，root-motion 约束只收紧 Cine57/UE 导入链路；分镜和动画预览继续共用同一份 UAL2 GLB。

## Pipeline contract

```text
UE scan row
  -> source root-motion policy
  -> curated selection (rootMotion=true, evidence)
  -> UE FBX export
  -> FBX -> one-animation GLB
  -> root translation track gate
  -> UAL2 retarget
  -> final catalog verification
```

源路径中的 `RootMotion`、`Root_Motion`、`Root-Motion` 或独立 `Root` 路径段，以及资产名中的明确 `RM`/`Root` 标记可以作为证据；普通包含 `root` 的词、`InPlace` 变体和 retargeted 中间资产不算证据。源证据与 GLB 通道是两道独立门禁。

## Failure modes

- 扫描清单选择到 InPlace：策选测试失败或该候选被记录为 `no-root-motion-source`。
- FBX/GLB 转换后没有 `root` 平移通道：组装阶段失败，并指出具体 clip 和 GLB。
- 最终 GLB 的 C57 动画缺少 root 平移通道、动画顺序不一致或时长漂移：目录验证失败，不复制为客户端资源。

## Verification

- root-motion 源路径/资产名的正负例单元测试。
- 策选清单测试：所有 Cine57 片段都标记为 root-motion，且没有 InPlace 源路径。
- GLB 组装和目录验证：逐条检查 C57 动画的 `root` 平移通道、关节、旋转四元数、时长和顺序。
- 客户端类型检查、动画配置测试，以及内置浏览器中的动画入口和预览 smoke test。
