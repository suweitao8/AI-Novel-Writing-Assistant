# UAL2 角色脖子完整环带高亮设计

日期：2026-08-31

## Background

当前 UAL2 角色的主体高亮策略能够把 M_Joints 关节段显示为同色系浅色，但模型的外层脖子并不属于 M_Joints。它仍在连续的 M_Main 身体网格中，M_Joints 的脖子段只是一个较小的内部关节几何，因此从某些视角只能露出局部浅色片，无法形成完整的脖子环带。

## Decision

在资源层修复材质分区，而不是继续放大内部关节几何或引入运行时 shader：

1. 对两个 UAL2 GLB（带动画的 UAL2_UE_Anims.glb 和标准模型 UAL2_Standard.glb）的 M_Main 外层身体 primitive，按绑定姿态的脖子几何区域拆出独立的 M_Neck primitive。
2. M_Neck 保留原三角形顺序、位置、法线、UV、骨骼索引和权重，只改变 primitive 的材质归属；动画和骨架数据不重写。
3. M_Neck 保留独立材质边界但与 M_Main 使用完全相同的主体色；原有内部关节段继续保留并使用运行时浅色高亮，主体头部、躯干、肩部和外层脖子保持统一蓝色。
4. 提供可重复执行且遇到未知 UAL2 几何会失败退出的资源修复脚本，避免未来误把其他模型按固定坐标切坏。
5. 模型库的静态材质回填也声明 M_Neck，使标准模型预览不会落回 GLB 的默认紫色材质；动画/分镜公共材质门面继续负责动态换色。

## Neck selection rule

修复脚本只接受当前已知 UAL2 资源签名：Mannequin mesh、M_Main/M_Joints 两个原始材质、3389 个主体顶点、17196 个主体索引，以及 65 个 UAL2 骨骼。它选择主体 primitive 中绑定姿态下位于颈部环带的三角形：三角形中心位于脖子高度区间，且三角形所有顶点都在角色纵轴附近的外层半径内。脚本同时检查选中的三角形覆盖完整环向并包含上下边界；若选区为空、覆盖不完整或资源签名不符，直接报错，不输出替换文件。

## Data flow

~~~text
原始 UAL2 GLB
  -> repair_ual2_neck_material.cjs
  -> M_Main body primitive + M_Neck primitive + 原 M_Joints primitive
  -> PlayCanvas container
  -> setEntityMaterial()
  -> M_Main、M_Neck 主体色 / M_Joints 同色系浅色
~~~

## Error handling

- 资源修复脚本默认写入指定输出路径，不直接覆盖输入文件；CLI 的 --in-place 仅用于已完成备份的发布步骤。
- 输入不是 GLB、JSON/BIN chunk 无法解析、材质/顶点/索引签名变化、选区不完整时，脚本以非零状态退出并保留原文件。
- 运行时遇到没有 M_Neck 的旧资源仍按 M_Main/M_Joints 兼容运行，不影响其他模型。

## Verification

- 资源测试检查两个 GLB 都有 M_Neck，且主体三角形已拆分为 body 与 neck；按 16 个环向区间验证没有缺口，并确认骨架、动画数量和原 M_Joints primitive 仍存在。
- 运行时单元测试检查 M_Neck 与 M_Main 共用主体蓝色材质、M_Joints 保持独立浅色材质，换色时同步更新，旧资源仍能回退。
- 客户端类型检查、聚焦测试、模型库门禁和文档清单通过。
- 应用内浏览器检查动画预览和分镜 3D 预览，确认脖子与身体保持统一蓝色、关节继续高亮，控制台无错误。

## Out of scope

- 不修改 UAL2 的骨骼层级、动画采样、模型比例或相机。
- 不改变其他关节的颜色比例和不含 UAL2 的角色/模型。
- 不增加用户可配置的颜色或材质 UI。

## Follow-up decision: 下颚线可读性（2026-09-01）

前一版资源分区已经提供了完整的 `M_Neck` 几何边界，但如果运行时仍把它映射回主体蓝色，正面和侧面只能看到内部关节浅色片，下巴下缘会融入头部与脖子，角色比例不易判断。当前规则保留 `M_Neck` 与 `M_Main` 的基础材质契约，同时让运行时把 `M_Neck` 和 `M_Joints` 映射到同一个淡蓝色高亮材质；这样高亮只落在已校验的下颚线/外层颈部区域，不改变骨骼、动画或其他角色材质。
