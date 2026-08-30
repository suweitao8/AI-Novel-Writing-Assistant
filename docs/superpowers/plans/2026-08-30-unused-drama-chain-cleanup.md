# 漫剧主线无用链路清理实施计划

> 设计基线：`docs/superpowers/specs/2026-08-30-unused-drama-chain-cleanup-design.md`

## 目标

移除确定不再参与当前产品流程的占星空壳和旧聊天兼容链，保持 `/chat` 作为 Creative Hub 兼容入口，并确保漫剧生产、历史项目、共享 SSE/RAG/Agent 能力不受影响。

## 实施步骤

1. 删除服务端占星路由文件和 `/api/astrology` 挂载；删除旧聊天路由文件和 `/api/chat` 挂载。
2. 删除旧聊天页面、组件和 `chatStore`，移除 `/chat-legacy` 路由及移动端导航、聚焦过滤、CSS 和对应测试夹具。
3. 更新当前路线文档、Prompt 治理说明和 Creative Hub 边界文档；将仍被漫画分格链路使用的事实提取提示词迁入 Prompt Registry，保留 archive 历史记录，不修改数据库 schema、迁移或用户数据。
4. 做引用审计，确认旧聊天/占星运行时引用不再存在，且 `/chat` 重定向、漫剧路由、`useSSE` 共享调用仍保留。
5. 运行客户端导航测试、服务端路由测试、类型检查和构建；复查 diff 后提交签名分支。

## 文件边界

- 删除：`server/src/modules/astrology/http/astrologyRoutes.ts`、`server/src/creativeHub/http/chatRoutes.ts`、`client/src/pages/chat/`、`client/src/store/chatStore.ts`。
- 修改：`server/src/app.ts`、`client/src/router/index.tsx`、漫剧聚焦导航、移动端导航、移动端 CSS、当前路线文档、Creative Hub 边界文档、Prompt 治理说明、漫画 Prompt Registry 及受影响测试。
- 保留：`client/src/hooks/useSSE.ts`、`server/src/llm/streaming.ts`、Creative Hub 正式运行时、漫剧旧项目页、漫画模块、小说/自动导演生产链和数据库文件。

## 验证命令

- `pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/mobileSiteNavigation.test.js`
- `pnpm --filter @ai-novel/server exec node --test tests/retiredRouteContracts.test.js`
- `node --test tests/prompting-governance.test.js`（server 工作目录）
- `pnpm --filter @ai-novel/client typecheck`、`pnpm --filter @ai-novel/client build`
- `pnpm --filter @ai-novel/server typecheck`、`pnpm --filter @ai-novel/server build`
- `rg` 全仓库引用审计和 `git diff --check`
