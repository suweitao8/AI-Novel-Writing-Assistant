# services/novel 根层收敛与 NovelEdit 拆分

## Background

`server/src/services/novel` 根层曾堆积 46 个文件（facade、内核服务、章节生命周期、工具混放），`client/src/pages/novels/NovelEdit.tsx` 曾达 2865 行（超 1300 行硬阈值一倍以上），两者都是架构规则明确要求收敛的违例。

## Decision

- 服务端按「根层只留 facade 与稳定入口」收敛，分阶段只动一个内聚子系统，保留兼容 re-export。
- 客户端编辑页按领域拆入 `pages/novels/edit/`，拆分方式为代码原样搬移 + 同名参数解构，hooks 顺序不变。

## Current Rule

- 已完成：6 个零引用 deprecated facade 已删除（NovelService/Generation/Pipeline/Review/Artifact/Export）；NovelEdit 拆为 9 个领域模块（边界见 `client/src/pages/novels/edit/README.md`）。
- novelCore* 家族（10 文件约 3400 行）收敛到 `novelCore/` 子目录、NovelCoreService.ts 留根层作 facade，是下一个优先阶段；随后是 pipeline/、章节生命周期归位 runtime/production、外围 Service 按消费方下沉。
- `routes/` 目录 24 个文件中，genre/knowledge/llm/styleEngine/titleLibrary/writingFormula 等仍直连 services，可按 comic/drama 模式建 `modules/<域>/http/`。

## Failure Modes

- 拆分长文件时用「列表项数」估算行数会低估（多行字符串占一个元素），必须以 wc -l 为准。
- Python 处理行区间时 `str.startswith(prefix, n)` 的第二参数是字符串内偏移，不是列表起点，必须用 `i > start` 过滤。

## Related Modules

- server/src/services/novel、server/src/modules/export
- client/src/pages/novels/NovelEdit.tsx、client/src/pages/novels/edit/

## Source Documents

- 2026-08-19 架构清理：commit 574c1ed1（facade 删除）、43b7adae（NovelEdit 拆分）。
