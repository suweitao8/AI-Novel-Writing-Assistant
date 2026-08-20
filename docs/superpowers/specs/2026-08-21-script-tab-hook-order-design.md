# 漫剧 Studio 脚本页 Hook 顺序修复设计

## 背景

漫剧 Studio 进入后会先渲染章节加载状态，章节查询完成后再渲染脚本内容。`ScriptTab` 在加载状态的条件返回之后调用 `entityNames` 的 `useMemo`，导致前后两次渲染调用的 Hook 顺序不同，React 抛出 `Rendered more hooks than during the previous render`，Studio 内容因此变成空白。

## 目标

修复 Studio 脚本页从“章节加载中”切换到“章节已就绪”时的 Hook 顺序错误，并增加针对该生命周期切换的回归保护。

## 设计决策

采用最小改动方案：将 `entityNames` 的 `useMemo` 移到 `ScriptTab` 的所有条件返回之前。这样所有渲染路径都以相同顺序执行 Hook，同时保留现有的实体名单 memo 化，避免无关的性能和显示行为变化。

不采用把 `useMemo` 改回普通对象的方案，因为该变更会撤销已有的渲染优化；也不拆分新的加载壳组件，因为本次问题只涉及 Hook 的位置，不需要扩大组件边界。

## 回归保护

客户端现有测试以 Node 契约测试为主，没有 React DOM 测试依赖。新增一条源代码契约，验证 `entityNames` 的 Hook 位于 `chaptersQuery.isPending` 和 `currentChapter` 条件返回之前，覆盖本次导致空白页的结构性约束。修复后还会通过真实 Studio 页面验证控制台无 Hook 错误且页面有可见内容。

## 范围

- 修改：`client/src/pages/drama/comicDrama/components/ScriptTab.tsx`
- 新增：客户端脚本页 Hook 顺序回归测试
- 不修改：后端、数据库、模型配置、运行端口、其他页面和业务数据

## 验收标准

1. 章节查询从 pending 变为 loaded 时不再出现 Hook 顺序错误。
2. 漫剧 Studio 页面可正常显示脚本页，不再出现空白根节点。
3. 新增回归测试通过。
4. 客户端类型检查通过，漫剧专项测试通过。
