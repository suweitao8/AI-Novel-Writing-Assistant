# 多会话并行开发的端口车道（Dev Lane）模型

## 背景

多个 AI 会话经常在同一仓库上并行开发。历史上所有 dev 服务都被固定在 `3100`（API）和 `5174`（Web）一对端口上，且规范要求 worktree 冒烟测试"停掉主区服务、占用 5174"。这产生了反复出现的冲突：

- 会话 A 的冒烟服务占住 3100/5174，会话 B 启动 dev 时 `stop-stale-dev-server` 杀掉 A 的服务，A 的验证中途断连；两个会话反复互杀形成"端口拉锯战"。
- worktree 的 dev 服务占用共享端口时，页面数据能加载（数据库随 worktree 拷贝或共享），但生成图片 404——图片按 checkout 落盘在 `server/storage/generated-images/`，worktree 的存储目录里没有主区生成的文件。表现是"预览图全部显示不出来"，极易被误判为产品 bug（实际案例：分镜 3D 草图预览全挂，排查数小时后确认是端口归属问题）。
- `core.hooksPath` 是全仓库共享的单份 git 配置。worktree 创建时执行 `setup:git-hooks` 会把它劫持到 worktree 路径；worktree 合并删除后主区守卫失效，主区 dev 启动报 "Git hooks are not installed"。

## 决策

引入"端口车道（dev lane）"模型：**每个 checkout 是一条独立车道，端口互不重叠；主工作区是用户面对的固定车道**。

- 主工作区：API `3100` / Web `5174`，永不漂移（`server/.env` 的 `PORT=3100` 为唯一来源；`CLIENT_PORT=5174` 为前端 dev 端口来源）。
- 每个 `codex/*` worktree：`pnpm workflow:worktree` 创建时按 checkout 绝对路径做 FNV-1a 哈希，确定性推导 API 端口（`3101-3199`）和 Web 端口（`5180-5379`），创建时探测端口占用并线性避让，最后把 `PORT=` / `CLIENT_PORT=` 写入 worktree 自己的 `server/.env`。
- 管道天然自洽：服务端从 `.env` 读 `PORT`；`client/vite.config.ts` 从环境变量 `PORT` 或 `server/.env` 读代理目标、从 `CLIENT_PORT` 读自身监听端口。supervisor 无需感知端口。
- `core.hooksPath` 归主工作区所有：worktree 创建不再在 worktree 内安装 hooks；`workspace-integrity-guard` 在 worktree 上接受指向主工作区 `.githooks` 的配置；主区 `dev:raw` 启动时自动把被劫持的 hooksPath 修回主区。

选择确定性哈希而非随机端口，是为了同一 worktree 多次启动端口稳定（浏览器页签、代理配置、日志排查都依赖稳定端口）；选择写入 `.env` 而非运行时传参，是因为 `server/.env` 本来就是端口唯一来源，不引入第二份配置。

## 当前规则

- 主车道的 `3100`/`5174` 属于用户的交互会话；任何会话的 worktree 冒烟都必须用自己的车道端口，禁止停掉或占用主车道。
- 车道端口在创建时一次性写入 worktree 的 `server/.env`，之后不得手动改动；发现端口被占时先查占用进程归属（`netstat -ano` → PID → 命令行），别的 checkout 的进程不动。
- `stop-stale-dev-server.cjs` 按 checkout 路径匹配清理对象，天然只杀本 checkout 的服务，不要放宽这个匹配。
- 判断当前端口由哪个 checkout 服务：`netstat -ano` 拿 PID → PowerShell 查进程命令行里的 checkout 路径。健康检查 200 不代表是"你的"服务。

## 失败模式

- 症状：页面数据正常但图片全部 404 → 当前端口被别的 checkout 的服务持有。修复方式是让主工作区服务回到 3100/5174，而不是排查图片接口。
- 症状：dev 启动报 "Git hooks are not installed"（主区）→ hooksPath 被某个 checkout 劫持。主区 `pnpm dev:raw` 会自动修复；手动修复跑 `pnpm setup:git-hooks`。
- 症状：两个会话的 dev 组互相杀对方子进程 → 存在两个 supervisor 同时跑。根因是旧规范驱使会话都去抢主车道；车道模型落地后不应再出现，出现时先查进程命令行里的 checkout 归属。

## 相关模块

- `scripts/dev-ports.cjs`：车道端口推导、探测、`.env` 写入（含单元测试）。
- `scripts/create-codex-worktree.cjs`：worktree 创建时 provision 车道并保持 hooksPath 归主区。
- `scripts/dev-service-supervisor.cjs`：主区启动时自愈 hooksPath。
- `client/vite.config.ts`：`CLIENT_PORT` 解析与 `/api` 代理目标。

## 来源文档

- AGENTS.md「Development Ports」「Development Workflow / Branching」
- 2026-09-01 分镜 3D 草图预览 404 排查（根因：worktree 服务占用共享端口）
