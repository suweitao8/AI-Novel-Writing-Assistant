# 设定中心（角色/场景/道具/世界观）

## 背景

目标用户是写作新手，此前的短篇与简易创作通道“拿到想法就直接写”：短篇正文上下文只包含想法、大纲与前文衔接，不携带任何角色/世界观数据，AI 是在裸写，产出“漂浮、没有人味”。而角色/世界观能力虽然存在（专业工作台的角色工作区、NovelWorld 生成管线），轻通道完全没有暴露；场景（地点）与道具全项目没有数据模型。

用户确认的三项关键决策：

1. 覆盖范围：短篇工作室 + 简易模式书架页；专业工作台不动（已有世界观/角色准备步骤）。
2. 设定时机：AI 自动生成设定草稿 + 写作前确认步（默认一键采纳，不强制手动填写，不卡新手）。
3. 「场景」= 地点场景（故事发生地，含氛围，可挂世界观地图节点）。

## 决策

- 新增轻量模型：`NovelScene`（地点场景）、`NovelProp`（关键道具）、`NovelSettingsWorld`（本书世界观摘要：前提/时代/基调/关键设定/地图节点连线）。角色复用 `Character`（基础字段视图），不新建。
- 世界观摘要**独立于 NovelWorld 生成管线**：`NovelSettingsWorld` 由设定中心自己读写；已有导演世界观的小说（简易/专业通道）在生成设定时传入 `existingWorldText`（来自 `worldContextGateway.getWorldContextBlock`）做 AI 蒸馏，保留原设定的核心与地名，不推翻、不耦合管线内部结构。
- AI 生成走 Prompt Registry 资产 `novel.story_settings.bundle@v1`（结构化输出，一次生成四类设定），符合 AI-first 规则：设定理解与生成交给模型，服务端只做 schema 校验与确定性落库。
- 短篇门槛是**服务端软门槛**：生产任务在 `settings_ready` 检查点停下（状态 `waiting_approval`，不属于失败），用户确认后 `clearCheckpointAndRequeue` 放行。恢复逻辑不会越过该检查点自动续写。
- 简易模式**不改导演链**：书架页“继续创作”前由前端调用 `ensureSettings` 补全缺失设定，失败仅提示不阻断续写（章节上下文在设定存在前不注入场景/道具块，属可接受降级）。v1 不为场景/道具新增导演 workflow step。

## 当前规则

### 数据与所有权

- `server/src/modules/novel/story-settings/` 是设定中心的唯一入口：`application/StorySettingsService.ts`（CRUD、ensure、regenerate、confirm、prompt 快照）+ `http/storySettingsRoutes.ts`（`/novels/:id/settings/*`）。
- `ensureSettings` 幂等：只补缺失类别（角色 0/场景 0/道具 0/无世界摘要任一触发），单次 bundle 生成后只写缺失的桶。
- `regenerate` 按类别重建：场景/道具整体替换，世界观整体覆盖；**角色只补充缺失，不删除已有角色**（保护关系、心理快照、状态等下游数据）。
- `NovelScene.mapNodeId` 指向 `NovelSettingsWorld.mapJson` 中的节点 id；bundle 的 `postValidate` 保证场景→地点、道具→持有者、连线→节点的引用完整性。
- **角色状态是外观与音色的唯一新入口（2026-08-21）**：`Character.statesJson` 里的 `StoryAssetState` 额外包含 `ageGroup`；性别仍属于角色基础身份。年龄段、外貌描述、图片提示词和音色提示词只在状态里编辑。`normalizeStoryCharacterStates` 会把没有状态的旧角色确定性归并成 `initial/初始状态`，把旧 `ageGroup/appearance/physique/attireStyle/facePrompt/voiceTexture` 作为一次性初始状态来源，并保留旧列作为兼容回退，不做删除式迁移。已有状态的人工提示词、图片、音频和显式 `referenceStateId: null` 不被覆盖。新角色默认带一个不可删除的初始状态；新增状态默认继承上一状态的年龄段与生图参考，状态描述可自动生成生图提示词，音色留空时沿状态链向前继承。服务端更新角色时必须保留首个状态，不能通过直接调用 API 删除或移动初始状态。
- **默认初始状态的唯一工厂**：`shared/types/novelReferenceExtraction.ts` 的 `createStoryCharacterInitialState` 是角色首状态的确定性来源；它按姓名、性别、年龄段和兼容旧字段生成可直接编辑的外观、图片提示词与音色提示词，不额外调用 AI。设定中心 CRUD、设定包批量落库、小说核心角色创建和角色库导入都必须把姓名等旧字段交给该工厂并直接写入 `statesJson`；服务端列表/更新归一化仍是最终兜底。客户端 `createInitialCharacterState` 只负责让创建弹窗提前看到同一份默认值，不能替代服务端归一化。
- **状态迁移的安全边界**：`parseStoryAssetStatesJson` 同时返回归一后的可读状态和 `canSafelyRewrite` 标记。只有 JSON 可解析、顶层为数组、已知字段类型正确且状态 ID/参考关系完整时，列表读取才允许把旧角色补成初始状态并回写；重复 ID、悬空 `referenceStateId`、损坏 JSON 或含非法字段的原始字符串保持不动，图片/音色生成也会停止并提示先在设定中心显式保存，避免读时迁移覆盖手工数据。服务端新建/更新会拒绝重复 ID 与悬空引用；状态图片、音色和表单保存使用 `statesJson` 条件更新与有限重试，只合并目标状态或最新运行时资产，避免并发请求互相覆盖。
- **外观状态（statesJson）**：Character/NovelScene/NovelProp 都用 `statesJson` 记录资产随剧情的形态（初始、换装、受伤、昼夜、破损…）。后续状态由用户在编辑弹窗的 `AssetStatesEditor`（assetForms.tsx，三类资产共用）手动增删改；角色状态表单只要求状态名、年龄段、状态变化和可选音色变化，高级图片提示词按需展开。每个状态可配置 **生图参考 referenceStateId**：参考同一资产的另一个状态的图（典型：新状态参考上一状态，长相不变只换装/加伤），或不参考直接生成全新形象。列表/创建/更新 API 均带 states（替换式数组），列表读取时会做增量状态归并。
- **状态图片生成（2026-08-19 起）**：`StoryAssetStateImage += { status, url?, prompt?, provider?, generatedAt?, error? }`（shared 契约）；`AssetStatesEditor` 每个状态一行「生成图」按钮（ImagePlus/RefreshCw），服务端 `StoryAssetStateImageService.generateStateImage`（modules/novel/story-settings/application）即时生成并读-改-写回 statesJson 的该状态 image 字段，返回更新后的资产 DTO。路由：`POST /novels/:id/settings/{characters|scenes|props}/:assetId/states/:stateId/generate-image` + 文件服务 `GET /novels/:id/settings/state-images/:stateId`（generated-images/story-state-images/:stateId/image.{ext}）。角色生图提示词以当前状态的性别、年龄段、状态画面提示词为准；场景/道具仍读取各自基础画面提示词再叠加状态变化。有参考图时锁定「同一主体只改状态描述」；规格=IMAGE_SPECS.characterAsset（设计参考横版）。参考图只认 done 且有 url 的状态图。**坑**：assetStateSchema 是 `.strict()`——新增 image 字段必须进 zod schema，否则编辑弹窗保存（states 原样带回 image）会 400；客户端 onSuccess 用返回 states 覆盖本地编辑态，保证弹窗保存带回的是含 image 的最新数据。**状态图的消费方**：分镜首帧图（drama.storyboard@v4 的每镜 characterStates × 状态名单 → 状态图优先作角色参考图，见 comic-drama-workflow.md 状态→分镜→首帧接线节）。
- **状态资产引用与音色契约**：`referenceStateId` 未提供时由 `normalizeStoryAssetStates` 按数组顺序补为紧邻上一状态；首状态补 `null`，显式 `null` 永远代表用户主动取消参考。状态图生成沿 `referenceStateId`/默认上一状态继续查找最近一个 `image.status=done` 的祖先图，不会因中间状态尚未生图而失去一致性参考。角色状态额外保存 `voice: { status, mode, sourceStateId?, sampleAudioUrl?, prompt? }`：上一状态链有已完成试听时默认 `reuse_previous`，复用只复制最近可用祖先的试听，不调用模型；选择 `generate_new` 时按当前状态音色变化、前序状态音色提示、旧角色音色的顺序合成固定试听短句。状态音色路由为 `POST /novels/:id/settings/characters/:characterId/states/:stateId/generate-voice`，读改写时只替换目标状态并保留其他状态的图片与音频。
- **下游消费边界**：漫剧分镜的 `characterStates` 是镜头级状态选择，`DramaDialogueAudioService` 和 `DramaAudioSegmentsService` 必须用它覆盖角色基础音色；完成状态试听作为 `TTSGenerationRequest.referenceAudioUrl` 传给 `voxcpm2` 的 `metadata.audio_url`，并纳入 `voiceKey`，这样状态变化会把旧对白标为过期。配音默认 provider 为 `voxcpm2`，`mock` 只作为显式联调选项。首帧图参考默认开启，前端必须显式发送 `false` 才表示用户取消参考。
- **角色表单从简（2026-08-21 用户决定：从小说做视频）**：基础资料只留 姓名/性别；年龄段、外貌、画面提示词和音色提示词归入角色状态，新增状态只需填写状态名与一句状态变化，年龄默认继承上一状态，高级图片提示词与音色变化按需填写。旧角色通过状态归并兼容，旧列仍保留供迁移回退，不再作为新的角色资产编辑入口。性格/着装/背景仍不属于这套视频资产表单（DB 字段保留）。**身份定位（role）2026-08-21 起整体移出角色面**：参考小说只处理成脚本，定位男主女主没有消费方——提取不再输出（reference_parse@v5，strict 拒绝）、表单/卡片徽标/快捷新建不再出现、创建入参改可选（缺省存空串）；DB 列保留，AI 生成设定包（storySettingsBundle）仍会填 role，服务端把角色拼进提示词上下文时按「名字（定位）」空值容错（formatCharacterSummary）。
- **道具表单从简（2026-08-19 用户决定）**：道具就是 道具名 + 画面提示词（visualPrompt）两个字段——道具类型/持有者/重要度/剧情功能/首次登场提示对生成画面没有作用，全部移出表单、卡片、漫剧资产详情弹窗与提取应用弹窗。客户端-only 收敛：DB 与 API 契约不动（propType/importance 服务端缺省，仍可被 storySettingsBundle 批量生成填充）；编辑保存时把 description/plotFunction/ownerCharacterId/firstAppearHint 置 null 清空，propType/importance 不传保留旧值。预填折叠规则：编辑/AI 草稿/提取应用都是 `visualPrompt || description`——旧数据只写外观描述时带进画面提示词，不丢内容。漫剧大纲快捷新建里道具的一句说明直接作为 visualPrompt 落库。小说写作注入（storySettingsPromptText）对 null 字段本来就有容错，旧道具已保存的剧情功能在下次编辑保存后从注入文本中消失，属预期。
- **角色删除**：`DELETE /novels/:id/settings/characters/:characterId`。设定资产可直接删；被写作链路（状态账本/关系/时间线等 FK）引用的角色删除会被数据库拒绝（P2003 → 409 明确报错），不做级联删除。
- **场景表单＝场景名/场景类型/时间/天气/图片提示词（2026-08-21 用户决定）**：时间（`NovelScene.timeOfDay`，morning/noon/night）与天气（`weather`，sunny/cloudy/rainy）是结构化枚举列（20260821120000 双迁移目录，additive），影响场景图的光线与氛围——生图提示词已接线（见下条资产参考图）。「氛围/环境描述」（summary）与「故事作用」（significance）移出表单与详情（DB 列保留、旧数据仍在返回值里，AI 设定包仍会生成）。**提示词统一命名「图片提示词」**：角色 facePrompt/场景 environmentPrompt/道具 visualPrompt 的字段名不动，UI 标签（表单/详情/状态编辑器）全部一致；提取（reference_parse@v6）的场景条目同步产出结构化 timeOfDay/weather，imagePrompt 的措辞三处统一。
- **资产参考图生成（2026-08-21 起，视图口径沿用旧项目）**：**场景＝360° 等距全景**（`IMAGE_SPECS.scenePanorama` 横版；提示词=全景构图语言 + 图片提示词 + timeOfDay/weather 映射的光线描述 + 两层画风）、**道具＝45° 三点透视单件视图**（`IMAGE_SPECS.characterAsset`）；**角色四视图**走分镜项目的 DramaCharacterImageService（头部正面/头部侧面/正面全身/背面全身，同日改为此口径）。状态存 `NovelScene.imageData`/`NovelProp.imageData`（GeneratedImageState JSON，20260821140000 双迁移），文件落 `generated-images/story-assets/{scenes|props}/<id>/`；服务 `StoryAssetImageService`，路由 `POST /novels/:id/settings/{scenes|props}/:assetId/generate-image`（同步等待）+ `GET …/image`（文件服务）；入口在资产页签编辑弹窗（可重新生成覆盖），脚本页右侧详情弹窗展示。**首帧图参考链**：`DramaShotKeyframeService` 挂角色设计稿的同时，按 `shot.location` 与场景名精确匹配挂场景全景、按画面文本断词匹配挂道具视图（meta kind=scene/asset）——都只在开启参考图时挂。

### 写作上下文注入（核心）

- 紧凑文本构建器：`story-settings/application/storySettingsPromptText.ts`，短篇与章节两条注入路径共用同一文本。
- 短篇：`shortStoryPromptContext.buildShortStoryWriterContextBlocks` 追加 `story_settings` 块（required，空设定不产生块）。
- 章节：`GenerationContextAssembler.assemble` 并行读取设定快照（`.catch(() => null)`，读取失败不得阻断章节生成）→ `GenerationContextPackage.storySettingsContext` → `buildChapterWriteContext.storySettingsPromptText` → `getAllContextBlocks` 渲染 `story_settings` 块。所有走该组装器的通道（简易/专业章节）在有设定数据时自动受益。
- 语义：设定块约束角色言行、场景氛围、道具功能、世界观规则“不得违背、可展开、不可推翻”。

### 短篇门槛与工作流

- 新增 `NovelWorkflowStage: short_story_settings` 与 `NovelWorkflowCheckpoint: settings_ready`（shared/types/novelWorkflow.ts），阶段/检查点文案映射在 `novelWorkflow.shared.ts` 与 `novelWorkflowExplainability.ts`。
- `ShortStoryProductionService.run()` 在 ensurePlan 之前执行 `runSettingsGate`：设定缺失 → 生成 → 记录 `settings_ready` 检查点并返回；齐全 → 直接进入规划。`recoverPending` 只恢复 queued/running，不会绕过检查点。
- 确认端点 `POST /novels/:id/settings/confirm`：清除检查点、重新排队，并由**路由层**调用 `shortStoryProductionService.schedule`（story-settings 服务不得反向依赖 short-story 模块，避免循环依赖）。

### 前端

- 共享组件 `client/src/pages/novels/components/storySettings/`：`StorySettingsTabs`（角色/场景/道具/世界观四页签）+ 四个 tab 组件 + `SettingsWorldMapView`；`assetForms.tsx` 是角色/场景/道具的共用表单字段组件——资产页签编辑弹窗与漫剧「提取」应用弹窗（`ExtractApplyDialog`）复用同一套表单，两边编辑体验必须一致（SVG 地图：多数节点有保存坐标时按坐标布局，否则环形布局；语义 token）+ `StorySettingsConfirmCard`（确认卡）。
- 短篇工作室：正文/设定二级页签 + 正文页顶部确认卡；简易书架页：创作/设定二级页签 + 续写前 ensureSettings。
- 遵循 novel-ui 规范：ui/tabs、Card、AiButton（AI 生成按钮）、toast、语义 token。

## 故障模式

- 设定生成失败：短篇任务走 `markTaskFailed`（可重试，重试会重新过门槛）；简易模式 ensure 失败仅提示、续写继续（不带新设定）。
- 部分类别落库后中断：下次 ensure 只补缺失类别，不会重复生成已有类别。
- 章节组装读取设定失败：被 catch 吞掉，章节照常生成（无设定块），排障时检查 `NovelSettingsWorld/NovelScene/NovelProp` 表与迁移状态。
- 确认后任务再次失败重试：检查点已清除，`retryTask` 会直接 requeue，重跑时设定齐全直接进入规划，不会二次卡确认。
- 双方言迁移：postgres 与 sqlite 各一份 `20260819120000_story_settings_models`，运行时迁移器启动时自动应用；新增列/表必须是纯增量。

## 相关模块

- `server/src/modules/novel/story-settings/`：设定中心服务与路由。
- `server/src/prompting/prompts/novel/storySettings.prompts.ts`：bundle 资产与 schema。
- `server/src/modules/novel/short-story/`：短篇生产链与 settings_ready 门槛。
- `server/src/services/novel/runtime/GenerationContextAssembler.ts` + `server/src/prompting/prompts/novel/chapterLayeredContext.ts`：章节注入链路。
- `client/src/pages/novels/components/storySettings/`：前端设定中心。
- 相关文档：`docs/superpowers/specs/2026-08-19-story-settings-hub-design.md`（设计）、`docs/wiki/product/`（新手优先决策）。

## 后续可选

- 导演链规划序列内的场景/道具生成步骤（替代简易模式的前端补全）。
- 设定与章节的关联追踪（某章发生在哪些场景、使用了哪些道具）。
- 专业工作台复用设定中心组件统一体验。


## 实体级 AI 生成（v1.1 追加）

- 属性结构参考旧项目 mydrama 的解析模型并反转方向：不从已有小说解析，而是按用户一句提示（可空=完全随机）现场生成。资产 `novel.story_settings.entity.generate@v1`，postValidate 强制只含请求的实体类型、姓名不与已有实体重名（角色名单以「名字（身份）」传入，比较时剥离括号后缀）。
- 图片提示词字段：角色 `facePrompt`（纯面部锚点，模板 `[性别]，[年龄段]，[发型发色]，[眼睛特征]，[肤色]，[脸型]`，禁止服装——与 mydrama 立绘生成共用同一约束思想）；场景 `environmentPrompt`（方位/光源/材质的空间描述，不含人物）；道具 `visualPrompt`（材质/工艺/尺寸/色泽/纹饰的固有外观）。这些字段是为后续「一键生成角色立绘/场景图/道具图」预留的锚点，正文生成不消费它们。
- 草稿不落库：generate 端点只返回草稿，前端填充表单供用户预览修改，保存走各实体 create 端点，避免产生垃圾行。
- 一致性上下文：生成时携带书名/题材/世界观摘要/已有实体名单，保证新实体融入本书而非凭空发明。


## 小说 → 漫画/短剧的基础角色库桥（v1.2 追加）

- 产品定位：设定中心的表面属性（性别/年龄段/体型/外貌/着装/面部锚点/性格）就是漫画与短剧改编的基础角色库；弧光等小说设计深字段只存在于专业工作台角色工作区，不进入改编链路，简易/短篇用户的正常流程也不会看到它们（simple 模式会被重定向到书架页）。
- 桥的落点：`SourceCharacter` 契约（`services/adaptation/contracts/sourceBundle.ts`）扩展 `ageGroup` 与 `facePrompt`；`NovelSourceAdapter` 先归一化 Character 的初始状态，再从状态映射年龄、视觉和音色，旧列只作为归一化回退（对齐旧项目 mydrama 的状态→资产消费顺序）。
- 漫画侧：`ComicProjectService.buildComicVisualAnchor`（已导出供测试）把 facePrompt 写入 `visualSpec.appearance` 的最前段，年龄段以中文标签进入锚点 description；短剧侧经同一 visualHint 自动受益。
- 改编仍是「一次性快照导入 + sourceCharacterRef 软引用」：导入后漫画角色与小说角色解耦（可拆分保证），小说侧后续修改不会自动同步——这是既有架构决策，如需再同步应走显式的重新导入。


## 世界地图工作台（v1.3 追加；v1.4 画布化；v1.6 三层级+AI 场景标注；v1.7 纯画布两级切换；v1.9 单层场景地图=当前形态）

- **地图是数据不是图片**：`NovelSettingsWorld.mapJson` 存 `{ overview, scaleKm, terrain, nodes, edges, childMaps }`——`x/y` 与地形顶点都是 0-100 平面百分比坐标。**刻意不走 AI 生图**。
- **v1.9 单层场景地图=当前形态（2026-08-21 用户决定）**：地图不再按 国家→城市 分层，也没有层级切换/下钻/国家下拉——**一张平面画布，节点就是场景资产**。「生成地图」= 把还没放上画布的场景交给 AI（`novel.world.map_annotate@v4`）估算相互位置关系后摆上来；地图还没有地形时顺便生成地形分区。理由：漫剧的生产单元是场景，国家/城市层级对新手是多余的结构负担，AI 编国家名还容易跑偏世界观风格；场景名本身来自章节，不需要再发明一层地名。层级相关代码已删（MAP_LEVELS/LEVEL_SCALE_KM/mapAtPath/面包屑），**childMaps 与 country kind 只做旧数据兼容**：读取归一时保留（容忍 PUT 往返）、UI 不再展示也不再写入新层级。
- **场景「已放置」按根图判定（迁移自愈）**：`NovelScene.mapNodeId` 指向**根图**存在节点才算已放置；旧层级数据里挂在 childMaps 内部节点上的场景视为未放置，下次点「生成地图」会重新摆到根图（旧 childMaps 数据留在库里不展示，随用户删节点逐步清理）。没有场景资产 → 400 引导先去「解析 → 提取」应用场景；所有场景都已放置/标记无法定位 → 400 提示新增场景后再生成。
- **v1.8 画布换成 React Flow（2026-08-21 用户要求，搬自旧项目 mydrama）**：`MapFlowCanvas`（@xyflow/react@12）提供点阵背景、滚轮缩放、拖拽平移、右下小地图；节点是卡片（`MapFlowNodes.MapCardNode`：色条+名字+说明；v1.9 起无下级数），地形多边形渲染成不可拖的背景层节点（`TerrainLayerNode`，pointer-events 关闭，点击空白处经 `screenToFlowPosition`+射线法命中选中）。**数据模型不变**：MapFlowCanvas 内部把 0-100 百分比按基准画布 1600px 换算成 React Flow 像素（node.origin [0.5,0.5] 让 position 即中心），拖动结束换回百分比上抛。旧纯 SVG MapCanvas 已删除。用户反馈小圆点 SVG「太抽象不像画布」——mydrama 的画布体验（自由缩放平移+卡片节点）是这次搬迁的参照。v1.8.1 打磨：画布铺满剩余高度（外层 Card 与画布下方提示行移除）；小地图节点显示地名（自定义 nodeComponent，fontSize 用 flow 单位大字号补偿 minimap 缩放）；当前级搜索框（不匹配卡片 opacity 0.15 淡出、相关连线同淡；v1.9 起占位符「搜索场景」）；生成按钮文案「生成地图」。
- **v1.6 三层级（2026-08-21 用户决定，v1.9 已废弃层级）**：层级语义按 childMaps 深度约定——世界层 nodes=国家（kind=country）、国家层 nodes=城市（kind=city）、城市层 nodes=具体地点（kind=building，即场景，`NovelScene.mapNodeId` 指向节点 id）。前端按 `MAP_LEVELS`（mapData.ts）渲染层级文案与默认 kind。
- **v1.7 纯画布两级切换（2026-08-21 用户决定，v1.9 已改为单层）**：交互=塞尔达式大地图——顶部切换条「国家级别 / 城市级别」；国家级别=世界画布（各国分布），城市级别=选定国家的城市画布（旁边国家下拉切换），点城市再下钻一层看城内地点（面包屑 国家 › 城市 回退）。画布上点国家/城市节点=直接进入下级，点地点=选中编辑；MapCanvas 用位移阈值区分点击与拖拽（原地松开=点击）。**所有工具栏按钮与右侧列表全部移除**（AI 标注场景、保存/已保存、画地形、添加节点、LevelListCard）——画布占满整行，点选节点/地形后编辑卡（NodeEditorCard/TerrainEditorCard）出现在画布下方、未选中不占位；改动（拖动/改名/删除）1.5s 防抖自动保存（成功静默、失败 toast），地图数据当前没有 UI 新建入口，内容来源=解析流程或服务端标注端点。
- **地理尺度（v1.7 内置，v1.9 已随层级一起移除）**：曾用 `LEVEL_SCALE_KM = [5000, 2000, 40]` 在连线上标公里数；单层场景地图没有固定地理跨度（一本书的场景可能同城也可能跨国），公里标尺与连线 km 标注已删，mapJson 的 scaleKm 字段保留在数据里只是兼容字段。
- **AI 标注地图（novel.world.map_annotate@v4，2026-08-21 单层化重写）**：一个动作一种语义——把 pending 场景（mapNodeId 不指向根图节点且 `mapUnmappable=false`）交给 AI 估算相对位置，输出 `placements`（sceneName+x/y+kind：city/region/building/wild/other，节点名=场景名、summary=场景摘要）与 `unplaceable`（无法定位的写 `NovelScene.mapUnmappable=true` 下次跳过）；**terrain 仅当 mapJson 还没有地形时输出**（3～8 个粗多边形 plain/mountain/water，postValidate 按 `terrainEmpty` 输入硬校验），已有地形后再也不动。传给 AI 的上下文=根图已有节点（名字+坐标，供新场景参照摆放）+ premise/era/keySettings。没有场景/全部处理完 → 400（见上）。合并走 `mergeAnnotation`（纯函数：同名地点沿用已有节点不覆盖人工坐标，其余只追加）后直接落库；误标注的解除=删除地图节点（`applyWorldMap` 清场景挂点回未放置态）。**命名风格约束只作用于地形 label**（v3 起的硬约束延续：地形名贴合 era/premise/keySettings 的世界观风格，现代世界不出现「荒原/王庭/秘境」这类玄幻词，虚构地名不用真实地名）——地点名=场景名不再由 AI 命名。前端入口=WorldMapPanel 顶栏「生成地图」+ 空画布中央同款按钮。
- **node id 稳定是硬契约**：AI 标注按名称对齐已有地点沿用原节点（`mergeAnnotation`），`NovelScene.mapNodeId` 的引用因此不丢；保存时被删节点会把引用它的场景挂点置空（`applyWorldMap` 的 updateMany）。
- **端点**：`POST /novels/:id/settings/world/map-annotate`（标注并落库）+ `PUT /novels/:id/settings/world` 的 `map` 字段（`worldMapUpdateSchema`，zod z.lazy 递归校验 childMaps）。路径含 `/settings`，简易模式写守卫天然放行。归一逻辑（坐标夹紧/重复 id/悬空连线剔除/地形≥3 点/childMaps 挂点必须指向真实节点/深度三级/每图节点 48 上限——上限要容得下一次标注的批量场景，静默截断会丢标注结果）在 `WorldMapService.normalizeWorldMap`，纯函数、契约锁定在 `tests/worldMapContract.test.js`。
- **漫剧侧世界观只读（2026-08-21 用户决定）**：漫剧工作室「设定 · 世界观」用 `WorldSettingsPanel` 只读展示关键设定条目（可删误提取）——条目唯一来源是章节解析（referenceParse 提取 worldview → 「提取」页签应用 → `updateStorySettingsWorld({ keySettings })` 追加，keySettings zod 上限 200 条）。不再提供 AI 生成世界观/基础设定编辑/保存按钮（小说侧 `SettingsWorldTab` 保持原样不动）。premise/era 数据仍在（解析与其他 AI 流程还读它），只是漫剧 UI 不再编辑。
- **AI 生成世界观（regenerate world）会覆盖地图节点吗**：bundle 资产一次生成含 mapLocations 的完整世界观，regenerate world 类别整体覆盖（既有规则，且 bundle 写入的旧格式不含地形/childMaps）；地图工作台的人工编辑保存在同一 mapJson，重新生成世界观会覆盖它——排障时先确认用户是否在小说侧点过「AI 生成世界观」。

## 美术风格（v1.8：两层组合 + 全中文指令 + 脚本切换时代风格）

- **两层组合（2026-08-21 用户决定）**：画风 = **通用画风**（系统级渲染质感基线：UE5 级 3D 写实、电影化光影，**不含任何时代/题材属性**——现代/末世/玄幻都由另一层叠加；存 AppSetting `drama.universalArtStyle`，留空用内置默认 `DEFAULT_UNIVERSAL_ART_STYLE`，设置页「通用画风」`/settings/art-style` 编辑，接口 GET/PUT `/api/settings/universal-art-style`，返回体含 `summary`——未自定义时是内置中文摘要、自定义时是自定义内容开头，供小说侧面板一行展示，**不在面板展示提示词原文**）+ **本书画风**（题材/氛围层：内置预设或本书自定义，如 现代↔末世、现代↔玄幻 切换）。首帧图与角色立绘提示词按 通用→题材 顺序拼接、negative 两层合并，统一解析入口 `services/drama/visual/dramaArtStyleResolver.ts`（注入点 DramaShotKeyframeService / DramaCharacterImageService）。拆层原因：v1 预设把「渲染媒介」和「时代题材」混在一条里，同一本书换题材时画质跟着跳；拆开后媒介恒定、题材可切。
- **风格指令全中文（2026-08-21 用户决定）**：通用画风与全部预设的 `styleInstructions`/`avoidInstructions`/`styleTag` 统一中文书写——自定义画风路径本就是中文、分镜与场景描述也是中文，管道按中文提示词运转；用户明确要求界面与风格内容尽量中文。tests/dramaArtStyle.test.js 锁定「内置指令不含成句英文」。
- **面板结构（2026-08-21 用户决定，收敛概念）**：「设定 · 美术风格」= 顶部一行「通用画风：{summary}＋修改链接」+ 一张「时代风格」卡（预设与自定义合成一个点选列表，点选即存 defaultArtStyle（默认时代风格）；卡片下半部是「自定义时代风格」增删改）。旧三卡结构（通用美术风格/默认具体风格/具体风格库）与「具体」术语已移除——用户反馈概念重复。
- **为什么放在 NovelSettingsWorld**：时代风格是「这本小说画什么题材」的小说级设定，与 mapJson 同挂在 `NovelSettingsWorld`（`artStylesJson` 自定义时代风格列表 `[{label,prompt}]`，≤12 条；`defaultArtStyle` 默认时代风格 id=内置预设 id 或自定义风格名）。两列均可空（20260820210000 双迁移目录各加一列 ALTER TABLE，additive 无损）。内置预设不入库：`services/drama/visual/dramaVisualStyles.ts`——2026-08-21 起为 6 项**题材叠加层**（现代都市/末世废土/东方玄幻/现代诡异/古代年代/民国年代，默认 `realistic`），渲染媒介词一律不进预设（媒介由通用画风决定，tests/dramaArtStyle.test.js 锁定）；旧版媒介预设（动漫/3D写实电影/真人实拍系措辞）随两层拆分移除，存量 defaultArtStyle 引用由 `updateWorld` 悬空检测自动回落。GET /drama/visual-styles 返回全量。
- **风格身份=名字**：自定义风格没有独立 id，label 就是身份——时代风格引用与 ArtStylePanel 展示都用同一个名字（改名=换身份，前端保存时按「initialLabel→新名」让引用跟着走，删除被引用的自定义风格时服务端 `updateWorld` 检测到悬空引用自动回落 null=内置默认）。`parseArtStyles` 读取时同名去重、剥离历史 key 字段。
- **画风解析链**：时代风格优先级（2026-08-21 用户决定：脚本切换是主入口，切换后后面都用新的）= **章节脚本【画风：名】标记**（从最新章节往前找最近一次标记——本章无标记=沿用上一次，即"新章节沿用上一章风格"；标记行格式与解析锁定在 shared/utils/scriptDocument.ts + tests/scriptDocument.test.js，标记名=预设 label 或自定义风格名，匹配函数 `matchDramaEraStyle` 兼容历史存的预设 id）> `DramaProject.visualStyle`（手动选择/创建时写入）> 小说 `defaultArtStyle` > 内置默认（预设列表首位）。「脚本」页签顶部有画风下拉：切换即在脚本末尾追加一条【画风：名】标记（走章节 expectation 自动保存链路）；GET /api/drama/era-style/:novelId 返回当前生效风格与来源（script/novel-default/builtin）供 UI 显示。已有分镜项目时改小说默认仅当选择的是内置预设 id 才同步推送 `setDramaVisualStyle`（自定义风格名不推送——生成侧自己会回落解析）。**生成侧（首帧图/立绘）**统一走 `resolveDramaArtStyleContext({ visualStyle, sourceRef })`：先查脚本标记，再 visualStyle/defaultArtStyle，都没有则只用通用层。注意：分镜镜头与脚本行没有位置级关联，标记的生效粒度是**生成时刻**（切换后新生成的画面用新画风），不是按镜头位置回溯——按位置精确映射需要先建 expectation→shot 链路，属后续工作。
- **画风不进「AI 解析」（2026-08-20 决定，2026-08-21 部分反转）**：v7 曾让 `reference_draft` 输出 styleSwitch（【风格：…】标记）按剧情切画风，用户看过实际产出后决定不要 AI 自动切画风；v8 起契约无 styleSwitch/artStyles。2026-08-21 用户要求**手动**在脚本里切画风（【画风：…】标记由用户在「脚本」页签插入，AI 解析不产出），与 v7 的区别是控制权在用户手里。**角色状态切换保留**：`stateSwitches`（【角色状态：名字：状态】标记）仍在脚本里输出——v4（2026-08-21）起**登记过状态的角色首次出场即写起始状态标记**（默认用 characterStates 名单第一个状态，即初始形象）：开场没有基准状态，后续切换就没有起点（用户实测第一章开头主角无状态）。其逐镜消费是画面生成侧的后续工作——做的时候解析标记行的位置在 Chapter.expectation 文本（`serializeDraftSegments` 的输出格式）。
- **世界观基本设定精简（同一时期决策）**：基本设定只留 世界前提 + 时代背景（前端下拉：古代/架空古代/民国/现代/近未来/未来/末世/异世界 + 自定义自由输入，存量非名单值自动转自定义态）；基调规则（toneRules）不再提供编辑入口——世界规则一律走关键设定条目（条目式更符合写作新手的心智）。存量 toneRulesJson 数据保留不删，AI 重新生成世界观仍读它，属可接受的遗留输入。
