# UE5 原生 Manny/Quinn 角色与动画资源设计

## Background

当前分镜 3D 草图和动画库都固定加载 `UAL2_UE_Anims.glb`。UE5 的
`Anim57` 动画先导出为 FBX，再经过离线重定向到 UAL2；因此模型绑定姿态、骨骼局部轴、
根/骨盆位移和手臂骨链都可能在转换中产生偏移。当前页面虽然能播放 GLB，但不能证明
动作仍然对应 UE5 原生 Manny/Quinn 的骨架。

UE5 工程已经存在同一套 `SK_Mannequin` 骨架下的 `SKM_Manny_Simple`、
`SKM_Quinn_Simple` 和徒手攻击资源。目标用户是用分镜 3D 草图做镜头预演，因此模型和
动画必须在同一套 UE5 骨架语义下运行，避免预览阶段重定向造成姿势漂移。

## Decision

1. **动画资源改为 UE5 原生骨架链路。**
   - UE `AnimSequence` 只导出一次 FBX，使用 FBX2glTF 转换并在同一源骨架上组装。
   - 不再调用 `retarget_ual2.py`，不把任何新 UE 动画写入 UAL2 发布包。
   - 导出前、组装后和发布前都记录源骨架、片段名、时长、帧率和 root-motion 证据。
2. **Manny 和 Quinn 是两个默认角色档案。**
   - 两个档案使用同一 `SK_Mannequin` 动画轨道，但各自指向对应的 UE5 角色 GLB。
   - 运行时按角色档案加载角色模型和动作；不把两个网格混进一个实例后再猜测应该显示哪一个。
   - 预览与分镜使用相同的蓝色代理材质和 HDRI 环境，便于和 3D 草图统一看法。
3. **角色档案由结构化数据决定。**
   - `gender` 和新增的结构化 `bodyBuild`（`slender | standard | broad | unknown`）是 AI
     输出/角色资料中的字段；不从中文 `physique` 自由文本写关键词匹配。
   - 默认路由：`female → quinn`；`male → manny`；`monster/other + broad → manny`；
     `monster/other + slender → quinn`；信息缺失时安全回退 `manny`。
   - 分镜布局支持 `modelProfileOverride: auto | manny | quinn`。显式覆盖优先于自动路由，
     且覆盖值随布局保存，后续刷新不会因为 AI 重新判断而改变角色。
4. **兼容旧布局。**
   - 旧的 `layout3d` 缺少模型档案时按当前角色结构化资料解析；未识别值按 `manny` 回退。
   - `actionPlaying` 仍被接受但保存时固定为 `false`，保留现有“直接落在预览帧”的合同。
   - `schemaVersion` 维持 1，新增字段全部可选，避免历史草图无法读取。
5. **临时文件单一托管。**
   - UE 导出、FBX、GLB、中间清单、日志和备份只能写入
     `D:/UnrealWorkspace/Cine57-exported/runs/<run-id>/`。
   - 不在 `Anim57`/`Cine57` 工程目录旁生成带序号的临时文件夹，也不删除未知历史产物。

## Runtime contract

```text
CharacterRecord(gender, bodyBuild, modelProfileOverride)
        │
        ▼
resolveCharacterModelProfile()
        │
        ├── manny: /anims/ue5/UE5_Manny_Animations.glb
        └── quinn: /anims/ue5/UE5_Quinn_Animations.glb
                         │
                         ▼
          PlayCanvas actor instance + native UE5 animation track
```

每个档案 GLB 必须包含对应角色网格、`SK_Mannequin` 兼容 skin 和同名动画片段集合。
动画目录的一个条目可以声明 `modelProfile` 为 `manny`、`quinn` 或 `both`；详情预览默认
使用 Manny，分镜演员按角色档案选择对应包。

## Scope and acceptance

- 角色档案解析在客户端/服务端共享同一组枚举和优先级，单元测试覆盖性别、体型、怪物、
  显式覆盖和未知回退。
- 分镜编辑器能在角色 Inspector 中读取并修改模型档案覆盖，保存后重新打开仍保持选择。
- 动画详情页和分镜 3D 草图不再引用 `UAL2_UE_Anims.glb` 作为活动 UE 动画源。
- UE 导入 smoke 必须在关闭 `Anim57` 编辑器后执行：四条指定攻击全部从
  `/Game/Characters/Mannequins/Anims/Unarmed/Attack` 导出成功，源骨架一致，两个角色档案
 组装成功，GLB 内容门禁通过，且前端和分镜实际能加载并播放非 T-pose 帧。
- 若 UE 编辑器保持打开，代码和合同测试仍可完成，但不能声称资产导出和浏览器 WebGL
  验收完成；等待用户关闭编辑器后再跑同一 run-id 的真实导出。

## Non-goals

- 本阶段不把 UAL1、UAL2 或其他专用怪物骨架的动画强行混入 Manny/Quinn。
- 不通过修改缩放、腰部瞄准或全帧 IK 来掩盖源骨架不一致。
- 不删除 `Cine57-exported` 中已有运行证据或历史备份。
