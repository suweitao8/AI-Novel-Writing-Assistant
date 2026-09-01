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

- 模型库先完成搜索与分类筛选，再按 24 条/页切片，只把当前页卡片挂载到 DOM；分类或搜索结果变化后回到第 1 页，越界页收敛到最后一页。
- 当前页仍用 `IntersectionObserver` 观察卡片根节点，仅在视口内或视口外 320px 范围内调用 `ensureThumbnail`；进入队列后解除观察，卡片卸载时释放尚未开始的排队项。
- 缓存命中直接显示，旧浏览器或缺少观察器时只走一次立即请求兜底；生成结果先更新内存缓存，localStorage 使用单个空闲任务合并写入，避免每张图同步重写整个缓存。
- 保留单工作室串行生成、256×192 输出、HDRI/材质/阴影规则和缓存合同；不通过删除目录或继续降低画质解决调度问题。

## Failure Modes

- 只给 `<img>` 加 `loading="lazy"`：只能延迟已生成图片的浏览器加载，不能延迟 GLB 和贴图解析。
- 只做分页但取消视口门控：当前页仍可能一次性启动 24 个串行 3D 任务，首屏会继续等待复杂模型；分页和视口门控必须同时保留。
- 把 256px 继续压小：只能减少 data URL 和解码成本，无法消除 GLB、贴图和材质解析成本。
- 翻页/筛选时只清理观察器和广播订阅、不释放未开始队列项：旧页任务会继续占用单工作室，导致新页等待。

## Verification

- 源码与行为测试锁定 24 条切片、页码边界、筛选重置、`IntersectionObserver`、`rootMargin: "320px 0px"`、离页队列释放和合并缓存写入。
- 内置浏览器回归检查当前页卡片数量、分页边界、搜索/分类重置、缩略图尺寸/属性、详情跳转和控制台错误。

## Related Modules

- `client/src/pages/models/ModelLibraryPage.tsx`
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- `client/tests/modelThumbnailPerformance.contract.test.js`
- `docs/wiki/product/model-library.md`
