# 纯网页产品定位与桌面子系统移除

## 背景

产品早期提供过 Electron 桌面版（安装包、自动更新、本机旧数据导入）。实际使用以网页端为主，桌面通道带来额外的打包、发布与维护成本，也让设置页出现「桌面更新仅在桌面版提供」这类对网页用户没有意义的入口。

## 决策

产品定位为纯网页应用，不再提供桌面版。2026-08-18 起移除整个桌面子系统。

## 当前规则

- `client/` 不再包含桌面运行时分支：没有 `APP_RUNTIME` 判定、HashRouter、桌面启动引导（DesktopBootstrapBoundary）、桌面更新与本机旧数据导入组件。
- 设置页没有「桌面与维护」入口；`/settings/maintenance` 路由已删除。
- 仓库不再有 `desktop/` 包；pnpm workspace、根 package.json 的桌面脚本、GitHub 桌面打包 workflow（desktop-release / desktop-beta-release）均已移除。
- 客户端版本号来源为 `client/package.json`（vite 构建时注入 `VITE_APP_VERSION`），不再读取 desktop/package.json。
- 官网（site/）与公开文档（docs/public/）统一使用「从源码启动网页版」的表述，不再提供桌面下载入口。

## 影响范围

- 自动导演、章节生产、模型设置等主链不受影响。
- `DesktopBrandMark`、`DesktopSidebar`、`DesktopNovelEditView` 等命名属于「桌面布局 vs 移动布局」的 UI 术语，与桌面软件无关，保留。
- `server/src/runtime/appPaths.ts`、`server/src/db/runtimeMigrations.ts` 中残留的桌面路径兼容分支只做本地路径解析，不影响网页运行，可后续随路径模块清理。

## 相关模块

- client 入口与路由：`client/src/main.tsx`、`client/src/router/index.tsx`
- 设置页：`client/src/pages/settings/`
- 官网与文档：`site/src/App.tsx`、`docs/public/`
