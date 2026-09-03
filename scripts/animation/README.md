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

末端 IK 默认按源姿态的接触证据启用：双手互相接近（腕间距不超过 `0.15m`）时
两侧同时求解，单侧手腕接近头部（距离不超过 `0.20m`）时只求解接触侧；普通
移动帧保持解剖骨段对齐结果，手部接触不会顺带开启腿 IK。需要对整条特殊动作强制校正时可设置
`RETARGET_USE_LIMB_IK=1`（全帧双臂和双腿），`RETARGET_NO_ARM_IK=1` 始终关闭。

完整命令格式：

```text
python scripts/animation/retarget_ual2.py <source.glb> <ual2.glb> <output.glb> <animation-name> [target-pose-animation]
```

## 发布前检查

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

这个检查同时验证旋转 accessor 类型、单位四元数、skin joint 目标，以及待机、行走、坐姿的可见动作语义。替换发布 GLB 前必须看到该检查通过。

## 动画导入运行目录

所有从 UE 导出的动画中间产物统一放在外部托管根目录的单次运行目录中，不写入
`Anim57`/`Cine57` 工程目录，也不把工程备份放在 `.uproject` 旁边：

```text
D:/UnrealWorkspace/Cine57-exported/
├─ base/                   # 压缩后的 UAL2 内置兼容基础包
│  └─ UAL2_AnimationBase.glb
└─ runs/<run-id>/
   ├─ fbx/                  # UE 导出的源 FBX 与 export_manifest.json
   ├─ glb/retarget/         # FBX 转换和逐条重定向中间文件
   ├─ final/                # 发布前门禁通过的暂存 GLB
   ├─ logs/                 # UE、组装、生成和门禁日志
   ├─ backups/              # 发布 GLB、清单和临时工程配置备份
   └─ run-manifest.json     # 本次运行的来源、产物和状态索引
```

四条徒手攻击 smoke 流程的入口是：

```text
node scripts/animation/run_animation_import.cjs \
  --run-id 20260902-anim57-unarmed-attack-smoke
```

该入口只读取 `D:/UnrealWorkspace/Anim57` 中指定的
`/Game/Characters/Mannequins/Anims/Unarmed/Attack` 四条资源，最终仍写入仓库的
`client/public/anims/cine57/UAL2_UE_Anims.glb`。若 UE 工程缺少命令行 Python 插件，
脚本只在编辑器关闭时临时写入配置，备份到当前运行目录并在导出结束后按 SHA256
恢复；失败也会先恢复再退出。运行目录已存在时必须显式传 `--reuse`，避免覆盖前一次
证据。

`Cine57-exported` 根目录下的旧 `animation_catalog*`、批次导出目录和质量隔离目录
属于历史资产，只有完成引用检查并保留可恢复清单后才允许移入 `archive/`；不要直接
删除 `Cine57`、`Anim57`、`base/UAL2_AnimationBase.glb` 或当前发布 GLB。基础包由
历史发布包剪枝生成，只保留 46 条非 `C57_` 的内置动作并压缩掉旧 UE 动画的未引用数据。

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

### 动画位移语义与门禁

Cine57 清单使用 `motionPolicy: "explicit-per-clip"`，每条资源都必须显式声明
`motionMode` 和一致的 `inPlace` 值。`in-place` 表示角色由分镜摆位控制移动：转换后的
GLB 中 `root` translation 的每轴范围与首尾净位移都不得超过 `0.03m`；没有 `root`
translation 轨道可视为原地，但 `pelvis` 的局部升降、下蹲和跳跃姿态仍必须保留。

`root-motion` 表示源动画有意携带角色整体移动，不能套用原地门禁，也不能在重定向时
清零 root 轨道；源 GLB、逐条重定向结果和最终目录片段都必须存在可观察的 `root`
translation 通道。当前 smoke 流程只发布 Anim57 Attack 目录下的四条 root-motion 攻击，
其它 UE 动画在独立清单通过同样门禁前不进入活动目录。

组装链路会再次检查源 GLB、重定向中间 GLB 和最终目录片段，避免缓存的旧中间结果绕过
门禁。最终验证还会检查手臂骨链没有非有限值、断裂或超出可达长度的异常，并把最终 GLB
的时长、帧率和 root 位移范围回填到清单，供前端和分镜运行时共用同一份证据。

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
