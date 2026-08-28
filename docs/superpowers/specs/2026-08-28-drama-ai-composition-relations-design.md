# 分镜 AI 关系构图与体量约束设计

## Background

当前分镜自动构图的输出把每个角色当成彼此独立的点：每个角色只有坐标、姿势和缩放，没有表达“谁在谁上面”“谁承载在地面”“谁应该更大”等叙事关系。这样即使镜头动作已经明确写出“叶晨躺地、血角兽伏在身上”，模型仍可能分别给出 `standing` 和 `prone`，服务端的数值归一化也无法发现语义反转。

第一个分镜的真实快照已经证明了这个问题：持久化布局中叶晨是站立姿势，血角兽是趴卧姿势，生成的 PNG 同样呈现为叶晨站着、血角兽躺在地上。问题发生在自动构图结果和缺少语义校验的边界，不是角色列表或 PlayCanvas 渲染顺序造成的。

## Goals

- 让自动构图先表达角色之间的空间关系，再落坐标、姿势、相对体量和相机。
- 对“上方/下方”和“更大/更小”这类关系建立可验证的结构化合同，不再只依赖自然语言提示。
- 对 `on_top_of` 关系自动落实地面承载者、上方主体的相对位置和姿势；关系声明的更大主体必须在实际身高与局部缩放合成后的体量上更大。
- 保留 AI 对剧情语义和镜头创意的判断；确定性代码只校验、归一化并落实已经结构化的关系，不使用角色名、关键词或固定坐标模板推断剧情。
- 不直接覆盖已存在的旧草图；用户点击重新自动构图后才应用新结果，失败时保留当前布局。

## Non-goals

- 不把血角兽、叶晨或任何具体角色名写进生产逻辑。
- 不把所有双人镜头都强制成“一个躺着、一个趴着”；只有 AI 输出的关系类型触发对应几何规则。
- 不改变 PlayCanvas 代理模型、姿势资源或手动编辑保存链路。
- 不通过保存路径静默修复用户已经手动调整的布局。

## Design

### 1. 结构化关系输出

升级已注册的 `drama.shot.blocking.autoPlan` Prompt 版本。输出继续包含 `actors`、`camera` 和 `compositionNote`，并新增必填 `relations` 数组。每条关系包含：

- `subjectCharacterName`：关系的主动方；
- `objectCharacterName`：关系的承载方、参照方或被作用方；
- `relation`：`on_top_of`、`under`、`beside`、`in_front_of`、`behind`、`facing`、`holding`、`attacking`、`following`；
- `sizeRelation`：`larger`、`smaller` 或 `similar`，用于明确叙事体量差，未强调体量时使用 `similar`。

关系方向有固定语义：`subject=血角兽, object=叶晨, relation=on_top_of` 表示血角兽在叶晨上方，不能反读。多角色镜头至少要输出一条关系，单角色镜头允许关系数组为空。关系中的名称必须来自本镜权威角色清单，每条完全重复的关系只出现一次。

Prompt 明确要求模型按“先识别关系、再规划坐标”的顺序工作，并把以下合同写进自检：`on_top_of` 的 object 是地面承载者，subject 是上方主体；承载者采用 `lying`/`prone` 等接地姿势，上方主体采用 `crouching`/`prone` 等贴近姿势；若 `sizeRelation=larger`，subject 的实际体量必须大于 object。Prompt 不再把这类要求埋在普通的“保持关系清楚”描述中。

### 2. 服务端关系归一化

`buildDramaShotBlockingAutoPlanLayout` 在现有角色名称、舞台半径和相机合同校验之后执行关系归一化：

1. 验证关系两端属于本镜角色集合，拒绝未知角色、重复关系和多角色镜头的空关系结果。
2. 先按角色身高把 AI 的局部 `scale` 换算为实际代理体量，再应用关系约束；不把身高差抹平。
3. 对 `on_top_of`：把 object 的根位置落到地面，将 object 收敛为接地姿势；把 subject 放到 object 的近邻上方，限制水平间距并给出基于承载者身高的正向高度偏移，subject 收敛为上方贴近姿势。原始 AI 坐标仍决定画面侧向关系和大致取景方向，不被固定坐标模板替换。
4. 对 `sizeRelation=larger/smaller`：比较 `heightMeters × 统一后的局部垂直缩放`。若结果违反声明，只按比例放大或缩小关系主体的三轴局部缩放；超出合同上限时返回结构化错误，不悄悄接受错误体量。
5. 关系归一化完成后再执行现有取景 FOV 兜底，保证调整后的两个主体仍在 16:9 画面内。

关系错误应当显式暴露给结构化调用链，允许 Prompt 的语义重试；不得用 `叶晨`、`血角兽` 等名称分支，也不得用正则从 `action` 文本猜测关系。

### 3. 失败与兼容

- `layout3d` 历史快照没有关系数组，读取和手动编辑继续兼容；只有新自动构图结果使用关系约束。
- 自动构图失败不调用 `loadLayout`，不覆盖已有草图和镜头设计说明。
- 关系只用于一次自动构图的结构化验证和几何落实，不写入旧的 `layout3d` 字段，避免用户手动改位后仍被旧语义强行回写。
- 自动构图返回的 `compositionNote` 继续保留简短的人类可读构图说明，便于用户检查关系是否符合镜头。

## File responsibilities

- `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`：关系 schema、Prompt 版本、关系方向和体量自检指令。
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`：关系名称完整性、关系归一化、接地/上方位置、实际体量约束和 FOV 兜底顺序。
- `server/tests/dramaShotBlockingAutoPlanPrompt.test.js`：Prompt 身份、关系输出合同、方向语义和关系约束文案。
- `server/tests/dramaShotBlockingAutoPlanService.test.js`：第一镜头关系夹具、角色姿势/位置落实、体量比较、未知/重复/缺失关系拒绝。
- `server/tests/shotBlockingAutoPlanFit.test.js`：关系归一化后仍能覆盖取景框。
- `docs/wiki/workflows/drama-blocking-3d.md`：记录 AI 关系是初始构图事实、确定性代码只落实结构化关系的长期规则。
- `docs/releases/release-notes.md`、`README.md`：记录用户可见的自动构图稳定性改进。

## Verification

- 先让关系夹具在现有代码下失败，证明当前合同确实无法保证第一个镜头。
- 运行共享包构建、服务端构建、Prompt/服务/合同相关测试。
- 使用当前真实第一个分镜的角色身高和动作上下文执行一次自动构图边界回归，确认结果为叶晨接地、血角兽位于其上方且实际体量更大；不得修改数据库作为测试前提。
- 通过隔离浏览器打开分镜 3D 编辑器，点击重新自动构图，检查视口、构图说明、PNG 自动保存和无新增控制台错误；失败时恢复原布局。
