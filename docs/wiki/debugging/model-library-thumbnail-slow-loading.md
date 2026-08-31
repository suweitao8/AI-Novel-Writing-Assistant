# 模型库缩略图慢加载排查

## Background

模型库卡片的最终图片很小，但生成图片前仍要在浏览器中加载并解析 GLB、贴图和材质，再使用 HDRI 离屏渲染一帧。目录扩大后，首屏体验取决于“何时把条目加入生成队列”，不能只看 JPEG 尺寸。

## Evidence

- 主分支页面一次性挂载 208 张模型卡片，卡片根节点的 effect 会在挂载时直接调用 `ensureThumbnail(entry)`。
- `thumbnailStudio.ts` 只复用一个离屏 PlayCanvas 工作室，并按 `pendingEntries` 顺序串行执行 `loadAsset`、材质回填、取景和 `toDataURL`。
- 固定端口 5174 的真实页面基线：约 1.5 秒仍有 114 个卡片占位；再等待约 5 秒仍有 88 个占位。
- 同一基线的浏览器日志出现多次 PlayCanvas 纹理格式转换昂贵警告，说明慢点发生在模型/贴图渲染链路，而不是普通 `<img>` 解码。
- 缩略图画布已经固定为 256×192，且页面已经使用 `loading="lazy"` 和 `decoding="async"`；这两个属性无法阻止 3D 生成器提前入队。

## Root Cause

模型卡片完整渲染与缩略图请求启动被错误地绑定在一起：全目录卡片同时执行 effect，208 个条目几乎全部进入同一条串行 WebGL 队列。单个模型越复杂，后面的卡片等待越长；刷新页面或缓存没有命中时，首屏会再次经历这条全目录队列。

## Decision

- 保留完整卡片 DOM、搜索、分类、键盘可达的详情链接和现有占位反馈。
- 用 `IntersectionObserver` 观察卡片根节点，仅在视口内或视口外 320px 范围内调用 `ensureThumbnail`；进入队列后解除观察，避免重复请求。
- 缓存命中直接显示，旧浏览器或缺少观察器时只走一次立即请求兜底。
- 保留单工作室串行生成、256×192 输出、HDRI/材质/阴影规则和缓存合同；不通过删目录、删除资源或降低画质解决调度问题。

## Failure Modes

- 只给 `<img>` 加 `loading="lazy"`：只能延迟已生成图片的浏览器加载，不能延迟 GLB 和贴图解析。
- 把全目录分页或虚拟化当成首选修复：会改变模型检索和键盘导航语义；如果未来要引入虚拟列表，仍必须保留视口生成门控。
- 把 256px 继续压小：只能减少 data URL 和解码成本，无法消除全量串行 WebGL 工作。
- 在观察器触发后不清理观察和广播订阅：筛选、路由切换或 React 重挂载时会重复入队或更新已卸载卡片。

## Verification

- 源码合同测试锁定 `IntersectionObserver`、`rootMargin: "320px 0px"`、卡片 ref 和无条件挂载入队的禁止规则。
- 内置浏览器回归检查完整网格、首屏缩略图优先顺序、滚动后后续卡片生成、图片尺寸/属性和控制台错误。

## Related Modules

- `client/src/pages/models/ModelLibraryPage.tsx`
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- `client/tests/modelThumbnailPerformance.contract.test.js`
- `docs/wiki/product/model-library.md`
