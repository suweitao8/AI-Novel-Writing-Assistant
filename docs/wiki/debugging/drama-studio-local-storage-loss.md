# 漫剧工作室状态凭空丢失：浏览器 localStorage 在内嵌浏览器不可靠

## 背景

漫剧工作室「参考/提取」页签最初把参考文本（按小说+章）与提取建议（按小说）存浏览器 `localStorage`，写入全部 `try/catch` 静默吞错。用户在应用内嵌浏览器中使用产品。

## 现象

- 服务端日志显示提取请求 200 且返回了多条建议，但「提取」页签始终显示「还没有提取结果。」。
- 参考文本粘贴、解析初稿都正常（内存态），但页面重载（Vite 热重启即触发）后参考文本清空，「提取」按钮因「还没有参考内容。」被禁用，点击无任何请求发出。
- 用 CDP 连接系统 Chrome 新开标签页复现：`localStorage` 里没有任何 `drama-studio-*` 键。

## 结论

内嵌浏览器（应用内置 webview）的 `localStorage` 不可靠：写入可能静默失败，且会话结束后不保证保留。所有 `try { setItem } catch {}` 都把故障吞掉了，于是状态只存在于当前页面的 React 内存里——重载即丢，且丢得无声无息。

## 当前规则

- **漫剧工作室的任何持久状态不得依赖浏览器 localStorage**：
  - 本章参考正文 → `Chapter.referenceText`（服务端，`PUT /chapters/:chapterId`，与 expectation 同链路）；
  - 整本参考小说 → 知识库文档（创建漫剧时上传，`getKnowledgeDocument` 读取）；
  - 提取建议 → 页级内存态（可一键重提，不落任何本地存储）。
- 如果未来确需浏览器本地缓存，只允许作为服务端数据之后的加速层，并在写入失败时给出可见反馈，不允许静默吞错。

## 诊断路径

1. 服务端 `/tmp/ainovel-dev-api.log` 看请求是否到达、响应体大小：到达且 200 有数据 → 问题在展示/持久化层，不在 AI。
2. 浏览器控制台 `Object.keys(localStorage)` 看 `drama-studio-*` 键是否存在。
3. 复现时注意区分「应用内嵌浏览器」与「系统 Chrome」——两者 localStorage 完全独立，CDP 连接的可能不是用户实际使用的那个浏览器。

## 后续同区故障：整本回落被当可编辑框，粘贴叠出多份重复文本（2026-08-20）

服务端持久化上线后，用户反馈「参考文本自己复制了 3 份、提取点不动」。排查结论：数据库与知识库都是单份（无重复保存请求），重复只出现在浏览器显示层——当时「参考」页签在章节没有参考文本时把**整本参考小说回落直接当可编辑文本**展示，用户往这个看起来是空输入框（实际已含整本）的编辑器里粘贴同一本小说，内容叠加成多份；「提取没反应」则是禁用原因只放在按钮 `title` 悬浮提示里，内嵌浏览器看不见。

修复与规则：

- 「参考」页签拆成预览/编辑两态：无本章参考文本时只读展示整本（解析/提取直接可用），一键「复制为本章参考」或「粘贴新文本」才进入编辑态——从结构上消灭「在整本上再粘一份」的路径（见 comic-drama-workflow.md「参考」子页签）。
- 操作按钮的禁用原因必须内联可见（灰字），不允许只放 title 悬浮提示。
- 诊断此类「文本重复」问题的关键第一步：先查服务端保存请求（`PUT /chapters/:id` 的 body 大小）与 DB 字段长度——若服务端始终单份，重复必然在显示/输入层，与持久化无关。

## 相关模块

- `client/src/pages/drama/comicDrama/hooks/useReferenceDraftStage.ts`（服务端持久化 + 知识库回退）
- `client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts`（referenceText 状态与防抖保存）
- `server/src/services/novel/novelCore/novelCoreCrudService.ts`（Chapter.referenceText 读写）
- 迁移 `20260819230000_add_chapter_reference_text`
