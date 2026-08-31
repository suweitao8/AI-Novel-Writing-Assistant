# WebGL HDRI 预览生命周期与缩略图稳定性

## 背景

模型详情、模型卡片、动画详情和动画卡片共用 `blocking3d` 的 HDRI 投影环境。环境不是一张普通背景图：它由 PlayCanvas 的 WebGL 资源、投影着色器、可视穹顶和方向光共同组成。只要资源初始化、浏览器合成帧循环或 React 页面生命周期在错误的时机交错，就可能出现“模型和网格还在，但 HDRI 变成黑色”的半成功状态。

这类问题通常具有偶发性：首次进入可能正常，页面切换或快速重开后失败；主预览和缩略图还可能一处正常、另一处黑屏。因此只检查最终截图或只给着色器增加重试，不能证明生命周期已经正确。

## 决策

可见预览与离屏缩略图都必须把 HDRI 当作完整的渲染运行时处理。离屏缩略图画布挂载在文档中一个不可交互、几乎透明的容器内，并保持 PlayCanvas 帧循环直到 HDRI、模型和可视穹顶完成初始化；截图仍由缩略图生成器显式触发。应用销毁前才取消帧循环，并同步释放应用、画布容器和失败的异步初始化状态。

可见的模型查看器和动画查看器要在 React StrictMode 的同步清理窗口之后再创建 WebGL 应用。这样第一次被立即取消的实例不会在应用已销毁后继续发起 HDRI 或 GLB 请求，也不会与第二个实例争用同一画布的 WebGL 上下文。

缩略图缓存版本属于渲染合同的一部分。投影、材质、取景或 HDRI 生命周期规则变化时必须升级版本，避免旧的黑色截图继续命中；初始化失败则清空失败 Promise，后续请求可以重新创建工作室。

## 当前规则

- `blocking3d` 环境加载完成前，预览器不能把“已就绪”交给页面，也不能在资源尚未调度完时抓取缩略图。
- 离屏画布必须使用真实 DOM 容器承载，容器可以不可见，但不能依赖完全脱离文档的 canvas 来承载 HDRI 初始化。
- `app.start()` 后保留 PlayCanvas 的正常 RAF 生命周期；缩略图生成通过显式渲染/截图控制输出时机，不得在异步资源加载刚开始时取消 RAF。
- 取消或销毁必须覆盖三条路径：资源加载中、初始化失败、正常完成后的工作室闲置；每条路径都要释放应用和隐藏 DOM，并让下一次请求能够重新初始化。
- 进入模型详情页时，必须同步取消并释放仍在初始化/渲染的卡片缩略图工作室，详情页不得等待已失效的缩略图处理 Promise；generation guard 负责让后台异步任务自行收束。详情页默认预览图直接从当前可见画布抓取，不能让两套 HDRI WebGL 应用长期并行运行。
- 进入动画详情页时，继续遵循动画缩略图模块自身的取消与资源释放规则；模型详情页的非阻塞切换约束不应被复制成跨模块的共享等待。
- React StrictMode 下创建 WebGL 应用前至少让出一个微任务，并在异步结果返回后再次检查取消状态；被取消的查看器不能写入页面状态。
- 模型缩略图使用 `model-library:thumbnails:v26`，动画缩略图使用 `animation-library:thumbnails:v13`；取景、材质、投影或环境生命周期规则发生用户可见变化时递增对应版本。
- 诊断时分别记录主预览和缩略图的 HDRI 状态，并以浏览器控制台是否出现 shader 编译、WebGL context 或资源加载错误作为回归信号，不能只看模型是否出现。

## 示例

- 推荐：挂载隐藏画布 → 创建并启动 PlayCanvas 应用 → 异步加载 HDRI/GLB → 等待环境和可视穹顶完成 → 显式抓图 → 销毁时取消 RAF、销毁应用并移除容器。
- 推荐：工作室初始化 Promise 被拒绝后清空共享 Promise，让下一张卡片重新尝试，而不是永久复用已拒绝的 Promise。
- 推荐：列表退出时同步销毁缩略图工作室；详情页立即创建可见查看器，缩略图工作室在 Promise 尚未 resolve 时也必须持有可立即执行的销毁句柄，后台异步任务通过 generation guard 自行收束。
- 不推荐：把离屏 canvas 留在 detached 状态，或者在 `app.start()` 后立即 `cancelTick`，再靠手动 `app.update()` 代替浏览器帧循环。
- 不推荐：只清除 localStorage 或只改着色器缓存版本；如果旧 WebGL 应用仍在异步加载，黑屏竞态仍会再次发生。

## 失败模式

- 主预览出现模型和网格但没有 HDRI：优先检查重复 WebGL 应用、上下文丢失和异步加载是否在销毁后继续运行。
- 卡片缩略图黑屏但详情页正常：检查离屏 canvas 是否挂载到 DOM、RAF 是否在 HDRI 初始化期间被取消，以及截图是否早于环境完成。
- 详情页偶发出现 shader `infoLog: null`：把它视为 WebGL 生命周期/上下文信号，先排查 StrictMode 清理和同一 canvas 的实例竞态，不要直接改 shader 语法。
- 修复上线后仍看到旧黑图：检查缩略图缓存版本是否递增，并确认失败初始化没有把拒绝的 Promise 留在共享工作室状态里。

## 相关模块

- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dOffscreenCanvas.ts`：将缩略图画布挂载到隐藏 DOM 容器。
- `client/src/pages/animations/animationThumbnailStudio.ts`：动画缩略图的 HDRI 初始化、帧循环、截图和清理。
- `client/src/pages/animations/animationPreviewApp.ts`：动画详情查看器的异步启动和取消检查。
- `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`：模型缩略图的工作室复用、失败重试和资源清理。
- `client/src/pages/models/ModelEditorPage.tsx`：模型详情查看器的 StrictMode 安全启动。
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`：共享 HDRI 投影环境与 PlayCanvas 资源生命周期。

## 来源文档

- `docs/wiki/architecture/model-preview-lighting.md`
- `docs/wiki/architecture/model-preview-framing.md`
- `docs/wiki/workflows/drama-blocking-3d.md`
