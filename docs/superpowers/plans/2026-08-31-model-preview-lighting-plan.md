# 模型预览环境光与软阴影实施计划

## 1. 建立光照 profile 合同

- 在 blocking3d 环境模块集中定义默认与 `model-preview` 的参数。
- 扩展模型环境适配层的选项，并保留默认调用兼容性。
- 先添加覆盖范围和 profile 隔离的契约测试。

## 2. 调整共享运行时的可配置光照

- 让运行时按 profile 设置 ambient light。
- 让 HDRI 方向光按 profile 设置 PCF5、阴影有效距离、阴影强度和 bias。
- 确保清理与环境切换不会遗留上一个 profile 的全局场景状态。

## 3. 接入模型详情与模型缩略图

- 模型详情预览显式使用 `model-preview`。
- 模型库离屏缩略图使用同一 profile。
- 动画、分镜和场景调用不传模型 profile。

## 4. 自测与调参

- 运行 focused tests、typecheck 和 client build。
- 用内置浏览器复现床模型，截图对比环境填充、阴影黑度和边缘锯齿。
- 如截图仍过黑或过硬，只在 profile 内调整参数并重复 focused checks。

## 5. 文档与交付

- 更新模型预览的长期架构 wiki 与用户可见 release notes。
- 完成自测后签名提交，在主分支集成并显式推送 `origin/main`。
- 核对主分支与远端 SHA，并清理本次创建且已合并的工作树。
