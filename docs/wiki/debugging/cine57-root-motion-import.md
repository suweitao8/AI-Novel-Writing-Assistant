# Cine57 动画导入的 Root Motion 门禁

## 背景

分镜 3D 草图需要把角色的移动结果直接交给摆位和预览链路。UE 动画包中同时存在
Root Motion 和 In Place 片段；如果只按动作名称或骨盆平移来筛选，原地动作可能混入
目录，或者导出后动作只有姿态变化而没有角色位移。此类问题通常表现为角色走路时
脚步在动但角色不前进、不同资产播放结果互相错乱，且仅凭“GLB 能打开”无法发现。

## 决策

Cine57/UAL2 的新增 UE 动画目录采用“源证据 + GLB 轨道”双重门禁。源清单必须明确
表明资产属于 RootMotion/Root 路径，或资产名带有独立的 RM/Root 标记；导出结果还必须
在名为 `root` 的节点上提供 translation 通道。两层门禁分别解决“选错 In Place 资产”
和“源标记正确但导出结果丢失 root 轨道”两个问题。

## 当前规则

- `scripts/animation/build_animation_catalog_selection.cjs` 只选择通过严格源证据检查的资产。
- `InPlace` 证据优先级最高；同一记录同时出现 `InPlace` 和 `Root` 文本时仍然拒绝。
- `RM`/`Root` 对应资产只能通过有限的确定性候选名或显式映射匹配；不能用模糊字符串
  或骨盆通道推断 root motion。
- `export_cine57_animation_catalog.py` 拒绝没有严格 root-motion 标记的选择清单。
- `assemble_animation_catalog.py` 在源 GLB、重定向中间结果和最终片段三个阶段检查 root
  节点平移通道；任一阶段缺失都必须失败或丢弃该条目，禁止回退到 In Place 版本。
- `verify_animation_catalog.cjs` 和前端内容测试必须对每个 `C57_` 片段执行同样的 root
  平移断言。
- 旧动画目录保留兼容性，不把旧条目未经重新导出就伪装成新的 Cine57 root-motion 条目。

## 示例

- 推荐：扫描到 `.../RootMotion/...` 的 `A_Run_RM`，导出后确认 `root/translation` 通道，
  再加入 UAL2 目录。
- 推荐：某个语义动作没有同名 root 版本时，用清单中的显式映射选择已审计的 `RM_...` 资产。
- 禁止：将 `A_Run_InPlace`、只有 `pelvis/translation` 的 GLB 或仅因文件名含有普通
  `root` 文本的片段加入 root-motion 目录。

## 失败模式

- 角色姿态播放正常但位置不动：先检查最终 GLB 是否存在 `root` 节点的 translation 通道，
  再检查 UE 导出设置；不要改前端播放代码来补偿缺失轨道。
- 选择清单的条目明显减少：查看 `droppedClips` 的 `no-root-motion-source` 或
  `no-root-translation-in-export-audit` 原因，修复源资产或导出配置后重新生成。
- 组装阶段报“must contain a root translation channel”：说明源 GLB 或重定向结果与源标记
  不一致，应保留失败证据并修复导出链路，而不是放宽筛选规则。

## 相关模块

- `scripts/animation/rootMotionPolicy.cjs`
- `scripts/animation/rootMotionSourceOverrides.cjs`
- `scripts/animation/build_animation_catalog_selection.cjs`
- `scripts/animation/export_cine57_animation_catalog.py`
- `scripts/animation/assemble_animation_catalog.py`
- `client/src/config/animationLibrary.ts`

## 来源文档

- [Cine57 动画目录 Root Motion 设计](../../specs/2026-08-31-animation-root-motion-design.md)
- [动画资源导出工具说明](../../../scripts/animation/README.md)
