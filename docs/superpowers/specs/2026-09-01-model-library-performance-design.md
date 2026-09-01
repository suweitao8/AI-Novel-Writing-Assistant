# 模型库预览加载与分页设计

## Background

模型库当前发布 208 个静态前景模型。页面把全部卡片一次性挂载到 DOM，缩略图卡片通过 `IntersectionObserver` 只在视口附近调用生成器，但远离视口的卡片仍然参与布局、观察和 React 生命周期管理。模型缩略图不是直接下载的小图片：单个条目需要加载并解析 GLB、贴图和材质，使用 HDRI 离屏 PlayCanvas 工作室渲染两帧后，再输出 JPEG data URL。

真实页面基线显示：首屏可见 40 张卡片，约 6 秒后页面仍只有 40 张图片、168 个占位；已生成图片的 `naturalWidth/naturalHeight` 为 `256×192`，`loading="lazy"` 和 `decoding="async"` 均已生效。日志中的 PlayCanvas 纹理格式转换警告也表明主要成本在 3D 资源与渲染链路，而不是 `<img>` 下载或解码。

当前代码历史中没有模型库分页实现。上一轮提交 `c08f63cf` 选择了“完整目录 + 视口门控”方案，因此分页需求没有被实现，而不是后来被删除。

## Goals

- 让初次进入模型库时只挂载当前页的模型卡片，降低 DOM、观察器和缩略图队列的规模。
- 保留缩略图的 256×192、4:3、HDRI、材质、落地阴影和缓存质量合同。
- 让分类和搜索与分页组合稳定：筛选结果变化后回到第 1 页，当前页超出范围时自动收敛到最后一页。
- 页面离开或切换分页时，不继续处理已经离开列表的排队缩略图。
- 避免每生成一张图片就同步序列化并重写全部 localStorage 缓存，降低主线程长任务。

## Non-goals

- 不删除模型文件、缓存数据、数据库数据或旧模型目录。
- 不修改模型详情页、动画库缩略图或漫剧 3D 场景。
- 不通过降低预览尺寸或 JPEG 质量掩盖 GLB/贴图解析成本。
- 不引入服务端分页；模型目录仍是前端静态清单，分页只负责浏览器端展示和生成调度。

## Decision

### 1. 筛选后分页

`ModelLibraryPage` 采用固定 `MODEL_LIBRARY_PAGE_SIZE = 24`。数据流保持单向：

```text
静态模型清单
  -> 排除不可展示的角色资源
  -> 分类筛选
  -> 搜索筛选
  -> 24 条切片
  -> 渲染当前页卡片
```

分页组件放在模型页私有 `components/ModelLibraryPagination.tsx` 中，复用现有 `Button` 和语义色 token。它提供“上一页”“下一页”和“第 X / Y 页”的可读状态；页数不超过 1 时不渲染无意义的控件。按钮在边界页禁用，保留键盘触发与可见 focus ring。

分类切换或已防抖的搜索词变化时，页码重置为 1；如果结果数量减少导致当前页越界，页码收敛到最后一页。空结果继续使用现有空状态和清除筛选动作。

### 2. 当前页内继续视口门控，并释放离页请求

当前页卡片继续使用 `IntersectionObserver` 和 `rootMargin: "320px 0px"`。卡片进入范围后才调用 `ensureThumbnail`，已有缓存仍立即显示。

卡片卸载时取消尚未开始渲染的同 ID 队列项。正在进行的单个模型渲染不强行中断，完成后可安全写入缓存；新页面不会继承旧页面剩余的排队项。这样既保持 WebGL 资源安全，又避免快速翻页或筛选时把旧页全部处理完。

### 3. 缩略图缓存写入批处理

`memoryCache` 在缩略图生成完成时立即更新并广播，当前页可以马上显示图片。持久化改为合并调度：同一时间只保留一个待执行的写入任务，优先使用 `requestIdleCallback` 并设置有限超时，不支持该 API 时使用短延迟计时器；写入任务执行时一次性序列化当前缓存。缓存 key 和图片格式不变，因此不清空已有缓存，也不触发不必要的全量重生成。

持久化失败仍只关闭后续 localStorage 写入，内存缓存和页面显示继续工作。页面切换不会同步等待缓存写入，避免点击详情时再次阻塞 3D 查看器启动。

## Error and lifecycle handling

- `IntersectionObserver` 不可用时保留一次性立即请求兜底。
- 单模型加载、材质回填或渲染失败只让对应卡片保留占位，不阻塞其他卡片。
- 分页/筛选卸载卡片时清理观察器、缩略图订阅和未开始的队列请求。
- 缩略图工作室仍由现有 `disposeThumbnailStudio` 管理，模型详情页不等待后台处理 Promise。
- 快速连续切页时，已缓存条目直接显示，未缓存条目按新页面顺序重新入队，不重复入队同一 ID。

## Verification

先增加失败的合同/行为测试，覆盖：

1. 24 条分页切片、页码边界和结果变化后的页码收敛。
2. 页面只把当前页条目传给模型卡片，同时仍保留 `IntersectionObserver` 视口门控。
3. 卡片卸载会取消未开始的缩略图请求。
4. 缩略图生成循环只更新内存缓存并安排批量持久化，不再同步调用全量 `localStorage.setItem`。
5. 256×192、4:3、HDRI、材质、阴影和异步图片解码合同不回退。

实现后运行客户端聚焦测试、类型检查和构建；在固定端口 `5174` 的内置浏览器中验证模型库首屏、分类、搜索、分页边界、缩略图加载和详情跳转，并检查控制台没有新增错误。

## Related modules

- `client/src/pages/models/ModelLibraryPage.tsx`
- `client/src/pages/models/components/ModelLibraryPagination.tsx`
- `client/src/pages/models/modelLibraryPagination.ts`
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- `client/tests/modelThumbnailPerformance.contract.test.js`
- `client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs`
- `docs/wiki/debugging/model-library-thumbnail-slow-loading.md`
