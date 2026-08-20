# 漫剧解析/提取结果消失（卸载丢回调 + 旧缓存闩锁）

## 背景

用户反馈：漫剧工作室「参考」点「解析」出结果后，切走再回来，「提取」页签空了。
排查时数据库里 `Chapter.referenceExtractionJson` 明明有值，界面却显示「还没有提取结果」。

## 结论

两个独立缺陷叠加，都属于「客户端展示层丢数据」，服务端持久化本身没有问题：

1. **解析期间离开页面 → 结果彻底不落库。**
   - `useReferenceDraftStage.parseMutation` 曾把「提取结果 PUT + 初稿写入」放在 `onSuccess`。
   - TanStack Query 的组件级 mutation 回调（`useMutation` options 里的 `onSuccess`/`onError`）
     在组件卸载后**不会执行**；解析要并行跑两个大模型，耗时几十秒，这段时间路由切走后
     `mutationFn` 照常完成，但所有放在回调里的保存副作用全部丢失。
2. **重挂载时旧缓存闩锁 → 已落库的结果显示不出来。**
   - `useNovelChapterWorkspace` 的重置 effect 曾以「章节 id」做一次性守卫（`loadedChapterRef`），同 id 只重置一次。
   - 回到页面时 react-query 先给缓存数据（可能是保存完成前抓的旧列表，提取字段还是空），
     后台刷新回来后同 id 被守卫拦住不再同步——界面停留在旧值（空），直到下次换章。

## 当前规则

- **需要保证执行的持久化副作用必须放在 `mutationFn` 内部（或直接调 API 函数）**，
  不能依赖 `useMutation`/`useQuery` 的组件回调；组件回调只做 UI 反馈（toast、跳页签等）。
  原因：`mutationFn` 一旦发起就会跑完，与组件是否卸载无关。
- **服务端权威、客户端不改写的字段**（如 `referenceExtractionJson`），展示值应直接从
  查询数据派生，本地只保留「保存请求在途」的乐观覆盖（按章节 id 作用域，服务端数据
  追上后自然回落），不要做成「换章重置一次」的纯本地 state。
- 「编辑中的正文」（`expectation` / `referenceText`）仍是换章一次性重置 + 脏检查自动保存，
  与提取建议的派生模式区分开：前者是用户输入，后者是服务端成果。

## 失效模式 / 判别路径

症状「切走再回来提取结果没了」时，先查库：
`GET /api/novels/:novelId/chapters` 看对应章的 `referenceExtractionJson`：

- 库里有值 → 展示层问题（本文第 2 类）。
- 库里为空 → 保存没发生：解析期间离开了页面（第 1 类），或 PUT 报错（看 toast / 网络面板）。

## 相关模块

- `client/src/pages/drama/comicDrama/hooks/useNovelChapterWorkspace.ts`（提取展示值派生 + 直接 PUT）
- `client/src/pages/drama/comicDrama/hooks/useReferenceDraftStage.ts`（解析落库在 `mutationFn` 内）
- `docs/wiki/debugging/drama-studio-local-storage-loss.md`（同类症状的另一根因：内嵌浏览器 localStorage 不可靠）
