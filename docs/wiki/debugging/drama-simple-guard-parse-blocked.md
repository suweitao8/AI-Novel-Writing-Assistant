# 漫剧「解析」被简易模式只读拦截（路径白名单跟不上端点改名）

## 背景

漫剧工作室「参考」点「解析」报「简易模式项目当前仅供阅读。如需修改，请先切换到专业模式。」
用户反馈此问题反复出现：每次修好不久又会复发。

## 根因

`simpleCreationWriteGuard.ts` 的简易模式只读守卫里，漫剧项目曾按**端点路径正则白名单**放行
工作室写入（`reference-(draft|extract)/preview` 等）。端点后来改名/合并
（`reference-draft` + `reference-extract` → `reference-parse`）时白名单失配，
新端点被 409 拦死。**路径字符串硬编码的守卫跟不上端点演进**——这是同一故障
以不同面目反复出现的结构性原因，前后至少踩坑两次。

## 当前规则（2026-08-20 用户决定，彻底根治）

- `productionKind=comic_drama` 的小说**整体豁免**简易模式只读：漫剧工作室是这本书的
  正式编辑入口，章节增删改、参考解析、细纲、设定全部放行。
- 判定依据必须是小说自身的 `productionKind` 字段。**不能用 DramaProject 关联判定**：
  DramaProject 要到「从成稿生成分镜」才创建，新漫剧项目没有关联行，按关联判定会把
  分镜生成前的工作台全部拦死（已踩过）。
- **不要再给漫剧加任何路径白名单**——新增/改名端点时白名单必然失配。若确需按端点
  收敛权限，收敛点应放在路由定义处（该路由自己的中间件），不要放在全局守卫的
  路径正则里。
- 普通简易小说（productionKind 非 comic_drama）的只读行为不变（`/settings` `/outline`
  `/export` `/creation-experience` 白名单是稳定路径，保留）。

## 判别路径

症状「漫剧工作室某操作报 简易模式项目当前仅供阅读」：
1. 看该小说 `productionKind` 是否 `comic_drama`——不是则本就该拦（检查创建入口）。
2. 是 comic_drama 仍被拦 → 守卫版本旧（服务未重启）或有人往守卫里重新加了路径判定。

## 相关模块

- `server/src/modules/novel/http/simpleCreationWriteGuard.ts`
- `server/tests/simpleCreationMode.test.js`（改守卫必须同步更新）
- `docs/wiki/workflows/comic-drama-workflow.md` 简易模式写守卫一节
