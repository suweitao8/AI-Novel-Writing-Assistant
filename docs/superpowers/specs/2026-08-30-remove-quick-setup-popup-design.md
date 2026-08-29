# 移除快捷配置弹窗与全局创作门禁

## 背景

当前前端在 \`AppLayout\` 的所有布局分支中挂载 \`CreationSetupProvider\`。Provider 会请求 \`/settings/quick-setup/status\`，并把响应中的 \`data.readyForCreation\` 严格判断为唯一就绪条件。只要请求以成功状态返回但 \`data\` 为 \`null\`、缺少 \`readyForCreation\`，或服务返回的响应形状暂时不完整，前端就会把环境当成未就绪。自动提示 effect 随后打开标题为“让 AI 创作环境先跑起来”的 \`QuickSetupDialog\`；进入若干路由时的第二个 effect 也会重复触发。 \`AiButton\` 还会通过同一个 Provider 拦截所有 AI 操作，因此一次异常的状态响应会扩散成全局弹窗和操作门禁。

这条链路已经与模型能力分类后的产品结构重复：模型设置页以“文本 / 图片 / 音频”能力卡片为正式入口，文本任务的 \`resolveModel\` 统一解析到文本槽。一个文本模型配置完成后，运行时不需要快捷配置再次探测、写入 11 条任务路由或保存另一份全局选择。当前代码还保留着已移除创作向导页时代的快捷配置 API、弹窗、首页通知和服务端路由，导致状态源重复且容易产生误判。

## 目标

1. 快捷配置弹窗不再被挂载、自动打开或由任何 AI 按钮触发。
2. AI 操作按钮恢复直接执行自己的 \`onClick\`，不再受全局创作门禁影响。
3. 模型设置页 \`/settings/models\` 成为唯一的模型配置入口；文本模型配置仍由现有模型类别设置负责。
4. 首本书进度仍然可见。它只读取文本模型配置、小说、章节和自动导演任务，并把未配置环境时的下一步指向模型设置。
5. 删除快捷配置的前后端接口、专用类型、路由写入和测试，避免以后通过旧 API 或旧状态链路重新触发这套流程。

## 非目标

- 不删除模型类别设置、文本模型解析、任务路由运行时解析或图片/音频模型配置。
- 不改变自动导演、章节生产、模型连通测试或数据库表结构。
- 不自动删除已有 \`APIKey\`、\`modelRouteConfig\`、\`llm.currentSelection\` 数据；这些数据由现有模型设置和运行时兼容逻辑继续读取。
- 不更换开发端口、停止其他工作树的服务，或修改桌面端代码。

## 方案与取舍

曾考虑仅把 \`data:null\` 当成加载失败，或者只移除前端弹窗而保留服务端快捷配置。前者只能遮住当前误判，Provider、按钮门禁和重复状态源仍在；后者会留下没有正式 UI 入口但仍可被旧客户端调用的流程，也会继续维护逐条初始化任务路由的重复逻辑。

采用完整删除快捷配置链路，并保留一个更窄的只读 \`CreationEnvironmentService\`。该服务只判断当前文本槽是否有有效模型和地址（按已保存配置、环境变量、注册表默认值的既有优先级），供首书投影显示环境里程碑；它不探测模型、不写设置、不创建路由。文本任务路由已经由 \`modelRouter\` 统一解析到文本槽，所以配置完成后的自动准备由现有运行时行为承担。

## 数据流

```text
模型设置页 /settings/models
        │ 保存文本槽
        ▼
modelCategories + modelRouter（运行时统一使用文本槽）
        │
        ├─ AI 按钮直接执行各自操作
        └─ FirstNovelOnboardingService 只读环境 + 小说/任务状态
                         │
                         ▼
                首页首书进度卡跳转到当前 primaryAction
```

删除后的系统中不存在 \`CreationSetupProvider\`、\`QuickSetupDialog\`、\`CreationSetupNotice\`、\`requireCreationSetup\`、\`/settings/quick-setup/*\` 或 \`open_quick_setup\` 类型分支。首书投影的环境未就绪动作是普通 \`navigate\`，目标为 \`/settings/models\`。

## 影响文件

- 前端：移除全局 Provider、弹窗、通知、状态判断和快捷配置 API；简化 \`AiButton\`、\`AppLayout\`、\`Home\` 与 query keys；首书卡片使用服务端投影的下一步地址。
- 服务端：删除 \`QuickSetupService\` 和两个快捷配置 endpoint，新增只读环境检查，更新首书投影和测试。
- 共享类型：移除快捷配置请求/响应类型以及 \`open_quick_setup\` action kind。
- 文档：更新 onboarding 模块说明、模型类别架构页和用户公开说明；提交前按发布规则更新 release notes 与 README 最新更新。

## 验证策略

- 先添加静态回归契约，断言全局布局、AI 按钮、首页、API、query keys、服务端路由和文件树中没有旧快捷配置入口；在实现前运行并确认失败。
- 实现后运行前端契约测试、服务端契约测试、共享构建、服务端 typecheck/build 和客户端 typecheck/build。
- 复核 \`rg\` 结果，确认生产代码不存在旧快捷配置标识。
- 按项目 Self-Test Rules 尝试在固定端口执行浏览器 smoke；若端口由其他并行工作树或外部 fixture 占用而无法安全替换，保留具体占用证据并明确标记浏览器验收未完成，不终止其他会话。
