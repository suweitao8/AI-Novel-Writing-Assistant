# Cine57 动画导入的原地位移与姿态门禁

## Background

分镜 3D 草图需要让分镜系统控制角色的位置，因此目录中的行走、跑步和战斗动作应在
原地播放。Cine57 同时提供 In Place 与 Root Motion 片段；如果只按动作名称挑选，或把
骨盆局部平移误当成角色全局移动，Root Motion 片段会被放进分镜目录。播放时角色会随
动画整体漂移，缓存的重定向结果还可能让手臂姿态看起来像 T 姿或发生断裂。仅凭 GLB
能打开、动画有帧数，不能证明它适合分镜。

## Decision

Cine57/UAL2 新动画采用三层门禁：

1. **源证据门禁**：优先选择路径或资产名明确带 `InPlace`、`IP`、`INP` 的源；明确带
   `RootMotion`/`Root` 路径段或独立 `RM`/`Root` 名称标记的源拒绝。未标记但被精确策选
   的源只能作为候选，不能绕过转换后的数值检查。
2. **GLB 根位移门禁**：转换后的单片段 GLB 和重定向结果如果存在 `root/translation`
   轨道，每个轴的最大范围和首尾净位移都必须 `<= 0.03m`。没有该轨道表示没有导出的
   全局根位移，允许通过；`pelvis` 的局部升降属于动作姿态，不用于判断角色是否移动。
3. **目标内容门禁**：重定向只驱动目标 `skins[].joints`；旋转 accessor 必须是单位四元
   数；手臂骨链必须保持有限值、连续可达长度，待机/行走/坐姿等代表动作还要通过可见
   姿态测试。这样能挡住手部爆开、骨链断裂和旧缓存污染，但不会禁止自然的挥手、出拳
   或跨身动作。

## Current Rule

- `scripts/animation/build_animation_catalog_selection.cjs` 只生成原地候选，并把源证据写入
  `inPlaceEvidence`；它不再寻找或偏好 Root Motion 对应资产。
- `scripts/animation/filter_animation_catalog_selection.cjs` 在 FBX 转 GLB 后逐条读取真实
  `root` 轨道，生成新的清单和 `root-translation-audit.json`。超限候选进入
  `droppedClips`，保留原因和测量值，源 FBX/GLB 不删除。
- `scripts/animation/assemble_animation_catalog.py` 对源 GLB、每个重定向中间 GLB 和最终
  动画继续复查根位移；不能用旧的 Root Motion 中间文件复用通过。
- `scripts/animation/verify_animation_catalog.cjs` 在发布前检查片段顺序、时长、skin joints、
  accessor 类型、单位四元数、原地根位移和手臂骨链。只有通过后才允许替换
  `client/public/anims/cine57/UAL2_UE_Anims.glb`。
- `client/src/config/animationLibrary.ts` 用 `inPlace=true` 作为分镜主库范围；旧 UAL2
  动作继续作为兼容范围存在，不把旧条目伪装成新的 Cine57 原地条目。
- 根位移阈值是“尽量无全局移动”的导入门槛，不是把所有身体平移清零。骨盆下蹲、跳跃和
  坐姿的局部变化应由重定向保留；若分镜需要角色从 A 点走到 B 点，应由分镜摆位或路径
  系统控制，而不是重新放宽这个门禁。

## Examples

- 推荐：`.../InPlace/Jog/A_INP_JogFwd_Loop` 作为向前慢跑源，转换后 root 轨道范围为
  `0`，进入分镜目录。
- 推荐：没有显式 In Place 标记但精确命中的动作，先转换并检查根位移，只有数值通过才保留。
- 禁止：`.../RootMotion/.../A_JogFwd_Loop`、`A_Run_RM` 直接进入分镜主库；也禁止用
  `pelvis/translation` 的存在来证明“这是有用的移动动画”。
- 禁止：发现某个动作的手部超出手臂骨链可达范围时，仅在前端旋转角色或关闭蒙皮来掩盖；
  应保留失败条目和中间产物，检查源绑定姿态、四元数分量数、目标关节映射与重定向缓存。

## Failure Modes

- **角色整体向前漂移**：先看 `root-translation-audit.json` 的 `maxRange` 和 `maxNet`，
  再检查最终 GLB 是否复用了旧 Root Motion 中间结果；不要在 PlayCanvas 里做运行时抵消。
- **播放仍从 T 姿或手部异常开始**：检查最终动画是否驱动了 `skins[].joints` 之外的节点，
  再检查旋转 accessor 是否为 VEC4、四元数是否单位化，并抽查 UAL2 的自然站立基准是否
  仍为 `Idle_No_Loop` 的 40% 帧。
- **候选数量下降**：查看 `droppedClips` 中的 `no-in-place-source`、`root-displacement-too-large`
  和审计报告，不要为了补数量把 Root Motion 源重新加入清单。
- **清单与前端动作名不一致**：先写入最终选择清单，再串行生成
  `animationCatalogEntries.ts`；前端生成器不应读取旧快照。
- **外部导出目录与客户端资源不一致**：替换前创建带日期的备份，比较备份、外部最终 GLB
  和客户端 GLB 的 SHA-256；源 FBX/GLB 与剔除清单必须保留，便于重跑和追责。

## Related Modules

- `scripts/animation/inPlaceAnimationPolicy.cjs`：源证据、候选名和根位移阈值。
- `scripts/animation/build_animation_catalog_selection.cjs`：生成原地候选清单。
- `scripts/animation/filter_animation_catalog_selection.cjs`：转换后真实 GLB 根位移审计。
- `scripts/animation/export_cine57_animation_catalog.py`：按清单从 UE 导出 FBX。
- `scripts/animation/assemble_animation_catalog.py`：FBX → GLB → UAL2 重定向与逐阶段复查。
- `scripts/animation/verify_animation_catalog.cjs`：发布前结构、位移和内容门禁。
- `client/src/config/animationLibrary.ts`、`client/src/config/animationLibraryContent.test.mjs`：
  分镜/兼容范围与可见姿态回归。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`：只消费最终
  统一 GLB 中真实存在的姿势片段。

## Source Documents

- [动画资源导出工具说明](../../../scripts/animation/README.md)
- [模型库与动画库产品决策](../product/model-library.md)
