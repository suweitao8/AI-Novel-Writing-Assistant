# 漫剧优先的产品入口边界

## Background

产品当前的主要交付目标是横屏漫剧：项目创建、素材设定、脚本、分镜、配音、视频和三维预览共同组成一条连续工作流。早期小说、拆书、创作中枢和独立漫画页面仍可能存在历史数据、旧书签或服务端兼容调用，但它们不应继续与漫剧入口并列呈现。

## Decision

前端产品入口以 `/drama` 为唯一主线。桌面端主导航和移动端主导航只展示漫剧、模型、动画、任务和必要的资料/系统设置；旧产品 URL 保留轻量兼容路由并跳转到漫剧入口，避免旧书签直接落到空白页或已经不维护的工作区。

## Current Rule

- `/drama` 是项目列表入口；漫剧项目详情页承载脚本、资产、分镜、视频和设置等连续工作流。
- `/models`、`/animations`、`/tasks`、`/knowledge` 和漫剧相关设置属于漫剧生产所需的支持能力，可以从主导航或“更多”入口进入。
- `/comic/*`、`/creative-hub`、`/chat`、`/book-analysis`、旧小说列表/创建/详情路径和旧世界观、写法工具路径只作为兼容入口，统一导航到漫剧工作台；它们不应重新加入主导航。
- 知识库页面不得继续提供已经退役的创作中枢、拆书工作区链接。资料管理、索引、召回测试和资料查看仍保留，因为它们是漫剧脚本与资产设定的有效输入。
- 前端入口清理不等于数据层清理。服务端 `/api/comic`、历史服务、Prisma 模型、迁移和存储文件在没有数据迁移方案、备份和明确删除授权时必须保留。
- 漫剧仍可复用小说目录下的稳定共享组件，但共享代码必须通过明确的能力边界使用；删除旧页面时先检查路由、构建入口、运行时导入和兼容 API 的引用。

## Failure Modes

- 只隐藏导航而不处理旧路由，会让旧书签继续打开已退役工作区，造成“页面能打开但无法继续”的假可用状态。
- 删除前端页面时顺手删除 `/api/comic` 或数据库表，会破坏历史项目读取和已有文件关联；入口收敛应与数据迁移分开处理。
- 知识库或系统设置残留指向旧小说工作区的按钮，会把用户从漫剧主链路带到兼容跳转，增加认知和操作成本。
- 把所有 `novels` 命名的共享组件都删除，会误伤漫剧仍在使用的角色、场景、道具和设定编辑能力；命名不是删除依据，运行时依赖才是。

## Related Modules

- `client/src/router/index.tsx`
- `client/src/config/dramaFocusNav.ts`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- `client/src/pages/drama/comicDrama/`
- `client/src/pages/knowledge/`
- `server/src/app.ts`

## Source Documents

- [漫剧模块边界](./drama-forge-module-boundary.md)
- [短剧工作台流程边界](../workflows/short-drama-workspace.md)
- [项目入口收敛设计](../../superpowers/specs/2026-09-02-drama-first-product-surface-cleanup-design.md)
