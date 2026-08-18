# 设定中心（角色/场景/道具/世界观）设计

日期：2026-08-19
状态：已确认（用户已确认覆盖范围、设定时机、场景含义三项关键决策）

## 背景与问题

用户反馈：从小说列表点进新建的短篇小说，页面过于简单；AI 直接开写导致内容"漂浮、没有人味"。

调研结论：

1. 短篇工作室（`client/src/pages/shortStory/ShortStoryStudioPage.tsx`）与简易模式书架页（`client/src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx`）都没有任何设定入口。
2. 短篇正文生成的上下文（`server/src/modules/novel/short-story/application/shortStoryPromptContext.ts`）只注入小说想法、大纲、前文衔接、平台与文风，**不注入任何角色/世界观数据**，AI 是在裸写——这是"漂浮"的直接技术根源。
3. 角色（`Character` 模型 + 角色工作区）与世界观（`NovelWorld` + 地图节点/关键设定）能力已存在，但只在专业工作台暴露；简易模式导演链其实会先生成世界观和角色再写章节。
4. 场景（地点）与道具在全项目没有任何数据模型。

## 用户已确认的决策

- 覆盖范围：短篇 + 简易模式两条轻通道；专业工作台不动（已有世界观/角色准备步骤）。
- 设定时机：AI 自动生成设定草稿 + 写作前确认步；默认可一键采纳继续，也可先编辑；不强制手动填写。
- 「场景」= 地点场景（故事发生地，含氛围描述，可挂世界观地图）。

## 方案

共享「设定中心」组件 + 分通道接入。备选方案及放弃理由：

- 新增导演链 workflow step 统一治理场景/道具生成：放弃。导演链是稳定性最高优先级，v1 不为其增加新步骤/检查点。
- 仅做查看 tab：放弃。不解决"硬写漂浮"的核心问题。

### 数据模型（增量迁移，无破坏性操作）

```prisma
model NovelScene {
  id           String   @id @default(cuid())
  novelId      String
  name         String          // 场景名，如「废弃地铁站」
  summary      String?         // 氛围/环境描述
  significance String?         // 在故事中的作用
  mapNodeId    String?         // 关联世界观地图地点（NovelWorld structure location id）
  sortOrder    Int      @default(0)
  source       String   @default("ai")   // ai | manual
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([novelId])
}

model NovelProp {
  id                String   @id @default(cuid())
  novelId           String
  name              String
  description       String?   // 外观/来历
  plotFunction      String?   // 剧情功能（作用/伏笔）
  ownerCharacterId  String?   // 持有角色
  importance        String   @default("major")  // core | major | minor
  firstAppearHint   String?   // 首次登场提示
  sortOrder         Int      @default(0)
  source            String   @default("ai")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([novelId])
}
```

角色与世界观复用现有模型，不新建。

### AI 设定生成

- Prompt Registry 资产：`novel.story_settings.bundle`（v1，taskType=story_settings，结构化输出）。
- 输入：小说基础信息 + 创作意图（originalIdea/structuredIntent）+ 类型/篇幅。
- 输出 schema：`{ characters[], scenes[], props[], world: { premise, era, toneRules[], keySettings[], mapLocations[] } }`。
- 一次生成全部设定，服务端分桶落库：角色写 `Character`（基础字段），场景/道具写新表，世界观摘要与地图地点写 `NovelWorld.structuredDataJson`（复用既有结构，地图视图从该结构派生）。
- 幂等：`ensureSettings(novelId)` 只补缺失的类别，可按类别重新生成。

### 流程接入

**短篇（服务端硬门槛）**：

- `ShortStoryProductionService.run()` 增加设定阶段：无设定 → 生成设定 → 状态停在没有确认点的 `settings_ready` → 任务返回，不自动继续。
- 新增确认端点：确认（采纳）后进入既有 planning → writing 流程并重新调度任务。
- `recoverPending()` 不得越过设定确认点自动续写。
- 工作室正文页顶部显示「设定已就绪」卡片：一键「采纳并开始写作」，或切到设定 tab 编辑后再确认。

**简易模式（前端前置补全，不改导演链）**：

- 书架页「继续创作/开始」前，若场景/道具为空先调用 `ensureSettings` 补全（世界观与角色导演链已生成）。
- 书架页增加二级 tab：创作（现有内容）/ 设定（设定中心），随时可看可改可重新生成。
- 章节/正文上下文一旦有场景道具数据即注入（见下），后生成章节自动受益。

### 写作上下文注入（核心）

- 短篇：`buildShortStoryWriterContextBlocks` 新增 settings.characters / settings.scenes / settings.props / settings.world 四个块（紧凑文本）。
- 章节生成：`GenerationContextAssembler.assemble` 增加场景/道具数据源（novelId 维度，按 importance/sortOrder 截断），进入 `GenerationContextPackage`；`chapterLayeredContext.buildChapterWriteContext` 渲染为紧凑块。纯增量、空数据不产生块，对既有链路零风险。

### 前端

- 新模块 `client/src/pages/novels/components/storySettings/`：
  - `StorySettingsTabs`（角色/场景/道具/世界观 四 tab，novelId 驱动）
  - 角色 tab：轻量卡片列表 + 基础字段编辑（不搬运专业角色工作区）
  - 场景/道具 tab：卡片 CRUD + 「AI 重新生成」
  - 世界观 tab：关键设定列表（可编辑文本）+ 地图视图（从 NovelWorld 派生，优先复用既有 geography map 渲染）
  - `StorySettingsConfirmCard`（短篇确认步卡片）
- 接入：短篇工作室五 tab（正文/角色/场景/道具/世界观）；简易书架页二级 tab（创作/设定）+ 设定就绪卡片。
- 遵循 novel-ui 设计规范与既有 ui/ 组件（Tabs/Card/Badge/Button/Input/Dialog）。

### API（`server/src/modules/novel/story-settings/`）

- `GET  /novels/:id/settings/overview`：各类别数量与就绪状态
- `GET/POST /novels/:id/settings/scenes`、`PUT/DELETE /novels/:id/settings/scenes/:sceneId`
- `GET/POST /novels/:id/settings/props`、`PUT/DELETE /novels/:id/settings/props/:propId`
- `GET /novels/:id/settings/characters`、`PUT /novels/:id/settings/characters/:characterId`（基础字段）
- `GET /novels/:id/settings/world`（摘要 + 关键设定 + 地图数据）
- `PUT /novels/:id/settings/world`（编辑摘要/关键设定）
- `POST /novels/:id/settings/ensure`（幂等补全缺失类别）
- `POST /novels/:id/settings/regenerate`（按类别重新生成）
- `POST /novels/:id/settings/confirm`（短篇确认步）

## 边界与风险

- 不修改专业工作台、不修改导演链 workflow step 目录与检查点。
- 短篇 `settings_ready` 是新的用户确认点：恢复逻辑必须停在确认点；确认是默认一键操作，不会卡住新手。
- 简易模式经其他入口（如恢复、自动导演创建页直达）启动时，设定补全发生在书架页下次继续时，章节上下文在设定存在前不注入场景/道具块（可接受的降级）。
- 数据库迁移为纯增量，遵守数据保护规则（不执行任何破坏性操作）。

## 验证

- 服务端：typecheck、定向测试（设定 CRUD、ensureSettings 幂等、短篇确认门槛不越权续写、上下文块包含场景/道具）、prompt 注册表治理测试通过。
- 前端：typecheck；UI 验收留给用户（按项目规则不做浏览器自动化验收）。
- 文档：release notes（用户可见新能力）+ wiki（产品决策页与模块边界页）。

## 后续可选（不在本次范围）

- 导演链规划序列内的场景/道具生成步骤（替代前端补全）。
- 场景/道具与章节的关联追踪（某章发生在哪些场景）。
- 专业工作台复用设定中心组件统一体验。
