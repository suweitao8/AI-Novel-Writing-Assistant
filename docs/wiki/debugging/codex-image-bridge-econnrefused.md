# Codex 图片通道 ECONNREFUSED（18766 桥未启动）

## 背景

角色/道具参考图与带参考图的生成统一路由到 Codex 图片通道（`server/src/llm/providers.ts` 的 `codex`，`baseURL=http://127.0.0.1:18766/v1`，`gpt-image-2`，走本机 codex CLI 登录会话的订阅额度）。该通道依赖仓库根目录 `scripts/codex-image-bridge.cjs` 这个**不自启的本地守护进程**；桥不在，服务端 fetch 立即被拒，`errorHandler.formatUpstreamConnectionError` 把 ECONNREFUSED 统一包装成「上游模型服务连接失败」文案（cause 里没有 host 时目标显示为「上游模型服务」）。

## 失败实例（2026-08-22）

用户在漫剧工作室上传/生成图片报「上游模型服务连接失败（ECONNREFUSED）」。`netstat -ano | grep 1876` 显示 18762（OpenCode Go）/18763（opencode serve）/18764（Grok Build 文本）/18767（Grok Build 图片）全部 LISTENING，唯独 **18766 没有进程**。根因：根目录 `package.json` 的 `dev`/`dev:log` 启动链只串了 `pnpm grok:bridge`（同时拉起 18764+18767），`codex:image`（18766）只有独立脚本、不在启动链里——开发环境重启后 Codex 桥一直是停的。音频已迁移到 IndexTTS 2.5 的 9005 API，不再占用旧的 18761。

## 当前规则

- `dev`/`dev:log` 启动链已固定为 `check-deps → grok:bridge → codex:image → run-with-log`（2026-08-22 修复）。`start-codex-image-bridge.cjs` 幂等：已就绪的桥直接复用（mydrama 项目先启动的同一套桥也共用），未就绪则守护式拉起并等 `/health` ready（最长 120s）。
- 新增本地通道类 provider 时，必须同步把它接进根目录 `package.json` 的启动链或说明手动拉起方式；只注册 provider 不接启动链，重启后必然复现 ECONNREFUSED。

## 排查路径

1. `netstat -ano | grep -E "1876[0-9]"` 对照端口表：18762 OpenCode Go 桥、18763 opencode serve、18764 Grok Build 文本桥、18766 Codex 图片桥、18767 Grok Build 图片桥。
2. 缺谁就 `curl http://127.0.0.1:<port>/health` 确认，再在仓库根目录跑对应 starter（Codex 为 `pnpm codex:image`），日志在 `%LOCALAPPDATA%\AINovel\codex-image-bridge\logs`。
3. 桥已就绪仍失败：看桥日志里的 `codex.cmd` 执行结果（登录过期/额度问题在桥侧报错，不会是 ECONNREFUSED）。

## 相关模块

`scripts/codex-image-bridge.cjs`、`scripts/start-codex-image-bridge.cjs`、根 `package.json` scripts、`server/src/llm/providers.ts`、`server/src/middleware/errorHandler.ts`（文案包装）、`server/src/services/image/assetProviderRouting.ts`（哪些资产路由到 Codex）。
