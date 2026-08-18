# 空白小说创建（方案 A：简易模式 + 书架从零开始工作台）设计

日期：2026-08-19
状态：已确认（用户已确认两项关键决策：AI 推理产物=先分章细纲再逐章写；总体方案=方案 A）

## 背景与问题

现有三种小说创建模式：AI 自动导演（AI 全权规划）、创作短篇（一句话想法）、手动创建（专业表单落地专业编辑页）。用户需要第四种「空白小说」：只起书名建一本空书，自己定义角色/场景/道具，写一个简略大纲，由 AI 推理出详细内容后推进全书。

调研结论（可复用底座）：

1. `createNovel` 接口仅标题必填，天然支持空白创建；`creationExperience="simple"` 时小说工作台为简易书架（`/novels/:id/simple`）。
2. 设定中心（角色/场景/道具/世界观四 tab）已实现并接入简易书架「设定」tab；实体级 AI 生成（一句提示生成实体草稿）由并行会话在 `feat/story-entity-generate` 推进。
3. `startDirectorTakeover` 可为已存在小说启动自动导演链，并按阶段就绪度「沿用已有资产」。
4. `Novel.outline` 字段已存在且当前无轻通道写入方；`novel.structuredOutline` 是专业工作台旧语义字段，不复用。
5. 缺失能力：用户简略大纲 → AI 分章细纲推理，以及细纲作为剧情契约注入导演链。

## 用户已确认的决策

- AI 推理产物形态：先推理成**分章细纲**（用户可改可确认），确认后 AI 按细纲逐章写正文；不直接从大纲跳正文。
- 方案 A：不新建独立工作台页面，空白小说落在简易书架，新增「从零开始」三步面板。备选方案（独立空白工作台页面 / 复用手动创建落地专业页）因重复面大或与新手定位冲突被否决。

## 方案

### 入口与创建

- 入口：首页 `HomeNextActionPanel` 与小说列表 `NovelListHeader` 增加第四个入口「空白小说」。
- 轻量弹窗 `BlankNovelCreateDialog`：书名必填 + 简要想法（可选，一句话或一段）。
- 创建：`createNovel({ title, description?, creationExperience: "simple" })`，成功后直达 `/novels/:id/simple`。

### 书架「从零开始」面板（BlankStartPanel）

- 显示条件：简易书架 progress 无 `directorTaskId`（导演未启动）。启动后回到现有阅读台体验，面板不再出现。
- 三步引导：
  1. **我的大纲**：textarea 随写随存（`novel.outline`）；引导用户可先去「设定」tab 自建角色/场景/道具（设定中心现成能力）。
  2. **AI 推理细纲**：调用推理端点返回草稿（不落库），前端逐章可编辑（标题/梗概/关键事件/出场角色/场景，可增删排序、可调整建议章数后重推），确认后保存。
  3. **开始创作**：先 `ensureStorySettings`（幂等只补缺失类别，尊重用户已建设定）→ `startDirectorTakeover` 启动导演链。
- 大纲在启动前可反复修改并重新推理；不写大纲也可直接开始（AI 依设定与想法自由规划，大纲是可选增强）。

### AI 细纲推理（Prompt Registry）

- 新资产 `novel.outline.expand@v1`（`server/src/prompting/prompts/novel/`，注册于 `registry.ts`，含 id/version/taskType/mode/contextPolicy/outputSchema）。
- 输入：书名、简要想法、简略大纲、期望章数（可选）、设定中心四类数据（角色名单与要点、场景、道具、世界观摘要）。
- 输出 schema：`{ premise, suggestedChapterCount, chapters: [{ order, title, synopsis, keyEvents[], characterNames[], sceneNames[] }], notes[] }`。
- 空设定/空大纲均可运行：AI 依想法与书名推理；但面板文案引导「先写大纲、先建设定，推理结果更贴你的想法」。

### 数据模型（增量迁移，无破坏性操作）

- `Novel` 新列 `userChapterOutlineJson String?`：确认后的分章细纲 JSON（含 `schemaVersion`）。
- `novel.outline` 复用为用户简略大纲原文。
- 不改 `novel.structuredOutline`（避免与专业工作台旧语义冲突）。

### 导演链接入（剧情契约）

- 导演输入组装（`novelDirectorHelpers.ts` / `novelDirectorFraming.ts` 的 project context 构建）新增上下文块：用户简略大纲 + 确认细纲（存在时）。
- 节拍表/章节列表/章节细化把细纲作为**必须遵循的剧情契约**：章节划分、事件顺序与结果不得推翻；允许做节奏与衔接性补全，补充性调整需在产出说明中标注。
- 章节写作上下文经由章节计划自然继承细纲梗概，不额外增加写作期块。
- 不改导演链 workflow step 目录与检查点（遵守稳定性最高优先级）。

### API（`server/src/modules/novel/planning/http/`）

- `GET /novels/:id/outline`：返回 `{ outline, chapters, confirmedAt }`。
- `PUT /novels/:id/outline`：保存简略大纲。
- `POST /novels/:id/outline/expand`：生成细纲草稿（不落库，返回即弃）。
- `PUT /novels/:id/outline/chapters`：确认保存分章细纲。

### 前端

- `client/src/pages/novels/components/createBlank/BlankNovelCreateDialog.tsx`：创建弹窗，首页与小说列表共用。
- `client/src/pages/novels/simpleCreation/BlankStartPanel.tsx`：三步面板，接入 `SimpleNovelShelfPage` 创作 tab 条件渲染。
- `client/src/api/novel/outline.ts`：上述端点的 client 封装。
- `homeViewModel.ts` / `NovelListHeader.tsx`：入口接线。
- 遵循 novel-ui 设计规范与既有 ui/ 组件。

## 边界与风险

- 细纲推理失败：面板内报错可重试；草稿不落库，不产生半成品数据。
- `ensureStorySettings` 只补缺失类别，不覆盖用户设定。
- 与并行实体级 AI 生成会话的文件接触面集中在 storySettings 组件目录，本方案不改动那些文件；合并时注意。
- 迁移纯增量，遵守数据保护规则（不执行任何破坏性操作）。
- 空白小说启动导演后与普通简易模式小说行为完全一致（恢复、质量债、导出等复用既有链路）。

## 验证

- 服务端：typecheck、定向测试（prompt 注册治理、expand 输出 schema 校验、outline CRUD、takeover 上下文含细纲契约块）。
- 前端：typecheck；UI 验收留给用户（按项目规则不做浏览器自动化验收）。
- 文档：release notes（新创建方式为用户可见能力）+ wiki 产品决策页。

## 后续可选（不在本次范围）

- 细纲与已生成章节的对照视图（哪些章已兑现）。
- 空白小说创建引导模板（如「只有角色没有大纲」的分步引导）。
- 专业工作台读取用户细纲。
