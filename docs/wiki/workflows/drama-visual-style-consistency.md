# 漫剧分镜统一渲染媒介与画风一致性

## Background

漫剧分镜会逐镜读取剧情上下文来判断现代、末世、古代等时代氛围。时代判断解决的是场景、服饰、材质和光线应该呈现什么气氛，不应该同时改变图片的渲染媒介。若逐镜候选同时包含写实和动画预设，同一集就可能出现写实镜头与卡通镜头交替，破坏角色、场景和观众体验的连续性。

## Decision

- `DramaProject.visualStyle` 继续表示时代/题材氛围；图片生成链另外解析一个稳定的 `renderFamily`（`live_action` 或 `animation`）。
- `renderFamily` 优先取项目明确选择的内置风格，其次取小说默认内置风格；没有可识别的内置风格时固定回落 `live_action`。项目级媒介锁优先于逐镜 `scriptJudge` 和资产状态的时代选择。
- 内置时代候选只有与 `renderFamily` 相同的预设才会交给逐镜 AI；自定义时代风格不声明媒介，只提供氛围并继承项目媒介锁。AI 返回跨媒介结果时丢弃，回到本镜兼容的时代链。
- 角色设计稿、场景/道具资产、状态图和分镜首帧都注入同一套媒介正向提示和负面约束。写实项目明确禁止卡通、动漫、插画、赛璐璐、平面 2D、手绘和低多边形玩具感；动画项目只有在项目明确选择动画预设时启用，并明确拒绝真人摄影媒介。
- 已生成的分镜不会因为规则升级而静默覆盖。画风变更在通用画风管理中完成，分镜页不提供逐集风格专用重生成入口；用户后续触发逐镜生成或合成准备时，新的素材复用当前全局媒介设置。未确认的摆位草图仍然阻止生成并不计费，旧版本通过首帧生成运行时的历史归档保留。

## Current Rule

- `realistic`、`post_apocalyptic`、`modern_eerie`、古代年代和民国年代属于 `live_action`；`guoman_fantasy` 才属于 `animation`。
- 当前项目如果选择末世废土，镜头之间可以从现代室内切到废墟氛围，但不能因为剧情判定把媒介切成卡通或动画。镜头内容、景别、动作、光线和时代氛围可以变化，角色比例、材质语言、摄影/动画媒介和整体渲染基线必须保持稳定。
- 新项目没有可识别的项目或小说内置风格时默认使用统一写实影视化。自定义风格名称不能单独打开动画媒介。
- 画风管理中的角色、场景、道具默认资产提示词也以写实影视化为基线，不再使用虚幻三维游戏渲染作为通用媒介；类别自定义提示词仍会叠加项目级写实媒介约束，避免单类配置把项目拉回卡通或游戏渲染。
- 分镜页顶部工具栏只保留「合成」作为批量出口。合成开始前按当前章节检查缺失画面和非就绪配音，画面与配音批量任务并发创建；已有进行中的同类任务只等待，不重复创建，准备任务失败或暂停时不得启动整集合成。逐镜生图、逐镜配音和无分镜时的初始生成仍属于局部操作入口。

## Failure Modes

- 如果同一项目的 `keyframeData.prompt` 中缺少「统一写实影视化媒介」，先检查 `resolveDramaArtStyleContext` 是否返回了 `renderFamily`，以及 `DramaShotKeyframeService` 是否把它传给正向和负面提示词构建器。
- 如果逐镜 AI 日志返回了不兼容的内置风格，检查 `availableStyles` 是否经过 `filterDramaEraStyleCandidates`；不应通过增加字符串匹配或 UI 特例来绕过媒介过滤。
- 如果旧图仍然显示为旧画风，先确认用户是否执行了强制重生成，再检查 `keyframeData.generatedAt`、版本历史和生成提示词。规则升级本身不覆盖历史图片。
- 真实视觉验收必须比较同一项目中相邻镜头（尤其是连续构图的镜头），同时确认图片仍为分镜严格 16:9；服务端测试通过只证明提示词与状态合同，不证明模型成图已经统一。

## Related Modules

- `server/src/services/drama/visual/dramaVisualStyles.ts`
- `server/src/services/drama/visual/dramaArtStyleResolver.ts`
- `server/src/services/drama/visual/DramaShotKeyframeService.ts`
- `server/src/services/drama/production/DramaBatchOrchestrator.ts`
- `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- `client/src/api/media/drama.ts`

## Source Documents

- `docs/superpowers/specs/2026-08-24-drama-storyboard-visual-style-lock-design.md`
- `docs/superpowers/plans/2026-08-24-drama-storyboard-visual-style-lock.md`
- `docs/wiki/workflows/comic-drama-workflow.md`
