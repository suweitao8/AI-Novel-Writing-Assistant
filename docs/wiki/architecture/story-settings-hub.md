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

- 共享组件 `client/src/pages/novels/components/storySettings/`：`StorySettingsTabs`（角色/场景/道具/世界观四页签）+ 四个 tab 组件 + `SettingsWorldMapView`（环形布局 SVG 地图，语义 token）+ `StorySettingsConfirmCard`（确认卡）。
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
- 桥的落点：`SourceCharacter` 契约（`services/adaptation/contracts/sourceBundle.ts`）扩展 `ageGroup` 与 `facePrompt`；`NovelSourceAdapter` 从 Character 映射这两个字段，并让 `visualHint` 以 facePrompt 打头（对齐旧项目 mydrama 的 face→appearance 拼装顺序——面部一致性优先于整体外貌）。
- 漫画侧：`ComicProjectService.buildComicVisualAnchor`（已导出供测试）把 facePrompt 写入 `visualSpec.appearance` 的最前段，年龄段以中文标签进入锚点 description；短剧侧经同一 visualHint 自动受益。
- 改编仍是「一次性快照导入 + sourceCharacterRef 软引用」：导入后漫画角色与小说角色解耦（可拆分保证），小说侧后续修改不会自动同步——这是既有架构决策，如需再同步应走显式的重新导入。
