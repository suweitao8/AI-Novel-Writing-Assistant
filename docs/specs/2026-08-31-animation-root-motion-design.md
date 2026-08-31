# Cine57 动画目录原地动画资产契约

## Background

分镜 3D 草图使用统一的 UAL2 代理角色，角色位置由分镜摆位和镜头系统控制。Cine57
动画包同时存在 In Place 与 Root Motion 版本；把 Root Motion 版本放进分镜目录会造成
角色整体漂移，并让不同来源的重定向结果难以复用。动画能被 GLB 解析器打开，并不等于
它适合分镜预览。

## Decision

Cine57 导入目录采用“原地源证据 + 转换后根位移 + 目标姿态”的三层门禁：

1. 源资产优先来自路径或名称明确带 `InPlace`、`IP`、`INP` 的 `AnimSequence`；明确带
   `RootMotion`/`Root` 路径段或独立 `RM`/`Root` 标记的源不进入分镜目录。未标记但被
   精确策选的源必须接受后续 GLB 审计。
2. 单片段 GLB 若存在 `root/translation` 轨道，每个轴的最大范围与首尾净位移均不得超过
   `0.03m`；无 root 平移轨道视为没有导出的全局位移，允许通过。`pelvis` 的局部升降、
   坐姿和跳跃姿态必须保留，不能用它来替代 root 判断。
3. 重定向只驱动目标 `skins[].joints`，旋转 accessor 为 VEC4 单位四元数，手臂骨链的
   数值和可达长度保持有效；待机、行走、慢跑和坐姿等代表动作通过客户端内容测试。
4. 旧 UAL2 动画保持兼容范围；新的 Cine57 片段必须标记 `inPlace: true`，分镜和动画
   预览继续共用同一个最终 UAL2 GLB。

## Pipeline contract

```text
UE scan row
  -> in-place source policy
  -> curated candidate selection
  -> UE FBX export
  -> FBX -> one-animation GLB
  -> root translation audit (<= 0.03m, or no root track)
  -> UAL2 retarget
  -> retarget/root/arm quality checks
  -> final catalog verification
  -> client static GLB replacement with verified backup
```

清单由 `scripts/animation/animationCatalogSelection.json` 固化，前端目录由
`generate_animation_catalog_entries.cjs` 串行生成。转换后的审计脚本写入
`rootTranslationAudit`、`droppedClips` 和每个保留条目的根位移指标；源 FBX/GLB 不删除，
以便重跑和追溯。

## Failure modes

- 角色整体向前漂移：检查 `root-translation-audit.json`、最终 GLB 和重定向中间文件，
  不要在 PlayCanvas 播放时做抵消，也不要把 Root Motion 源加入主库。
- 手部爆开或仍是 T 姿：检查 VEC4 accessor、四元数单位化、目标 joints 限制、目标自然
  站立基准和手臂骨链审计；失败产物应保留，不用材质或缩放掩盖。
- 候选数量下降：查看 `no-in-place-source`、`root-displacement-too-large` 和审计指标，
  接受数量下降优先于导入无法稳定摆位的动画。
- 清单和 GLB 不一致：确认候选清单过滤、组装、验证和前端生成按顺序执行，发布前比较
  外部最终 GLB、备份和客户端文件的 SHA-256。

## Verification

- `node scripts/animation/inPlaceAnimationPolicy.test.cjs`
- `node scripts/animation/animationCatalogSelection.test.cjs`
- `python -m unittest scripts/animation/test_assemble_animation_catalog.py`
- `node scripts/animation/verify_animation_catalog.cjs scripts/animation/animationCatalogSelection.json client/public/anims/cine57/UAL2_UE_Anims.glb`
- `node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs`
- 客户端类型检查与内置浏览器 `/animations` → 动画详情页 smoke test。
