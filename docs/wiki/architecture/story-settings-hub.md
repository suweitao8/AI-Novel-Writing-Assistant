# 设定中心（角色/场景/道具/世界观）

## 背景

目标用户是写作新手，此前的短篇与简易创作通道“拿到想法就直接写”：短篇正文上下文只包含想法、大纲与前文衔接，不携带任何角色/世界观数据，AI 是在裸写，产出“漂浮、没有人味”。而角色/世界观能力虽然存在（专业工作台的角色工作区、NovelWorld 生成管线），轻通道完全没有暴露；场景（地点）与道具全项目没有数据模型。

用户确认的三项关键决策：

1. 覆盖范围：短篇工作室 + 简易模式书架页；专业工作台不动（已有世界观/角色准备步骤）。
2. 设定时机：AI 自动生成设定草稿 + 写作前确认步（默认一键采纳，不强制手动填写，不卡新手）。
3. 「场景」= 地点场景（故事发生地，含氛围，可挂世界观地图节点）。

## 决策

- 新增轻量模型：`NovelScene`（地点场景）、`NovelProp`（关键道具）、`NovelSettingsWorld`（本书世界观摘要：前提/时代/基调/关键设定/地图节点连线）。角色复用 `Character`（基础字段视图），不新建。
- 世界观摘要**独立于 NovelWorld 生成管线**：`NovelSettingsWorld` 由设定中心自己读写；已有导演世界观的小说（简易/专业通道）在生成设定时传入 `existingWorldText`（来自 `worldContextGateway.getWorldContextBlock`）做 AI 蒸馏，保留原设定的核心与地名，不推翻、不耦合管线内部结构。
- AI 生成走 Prompt Registry 资产 `novel.story_settings.bundle@v1`（结构化输出，一次生成四类设定），符合 AI-first 规则：设定理解与生成交给模型，服务端只做 schema 校验与确定性落库。
- 短篇门槛是**服务端软门槛**：生产任务在 `settings_ready` 检查点停下（状态 `waiting_approval`，不属于失败），用户确认后 `clearCheckpointAndRequeue` 放行。恢复逻辑不会越过该检查点自动续写。
- 简易模式**不改导演链**：书架页“继续创作”前由前端调用 `ensureSettings` 补全缺失设定，失败仅提示不阻断续写（章节上下文在设定存在前不注入场景/道具块，属可接受降级）。v1 不为场景/道具新增导演 workflow step。

## 当前规则

### 数据与所有权

- `server/src/modules/novel/story-settings/` 是设定中心的唯一入口：`application/StorySettingsService.ts`（CRUD、ensure、regenerate、confirm、prompt 快照）+ `http/storySettingsRoutes.ts`（`/novels/:id/settings/*`）。
- `ensureSettings` 幂等：只补缺失类别（角色 0/场景 0/道具 0/无世界摘要任一触发），单次 bundle 生成后只写缺失的桶。
- `regenerate` 按类别重建：场景/道具整体替换，世界观整体覆盖；**角色只补充缺失，不删除已有角色**（保护关系、心理快照、状态等下游数据）。
- `NovelScene.mapNodeId` 指向 `NovelSettingsWorld.mapJson` 中的节点 id；bundle 的 `postValidate` 保证场景→地点、道具→持有者、连线→节点的引用完整性。
- **角色状态是外观与音色的唯一新入口（2026-08-21）**：`Character.statesJson` 里的 `StoryAssetState` 额外包含 `ageGroup`；性别仍属于角色基础身份。年龄段、外貌描述、图片提示词和音色提示词只在状态里编辑。`normalizeStoryCharacterStates` 会把没有状态的旧角色确定性归并成 `initial/初始状态`，把旧 `ageGroup/appearance/physique/attireStyle/facePrompt/voiceTexture` 作为一次性初始状态来源，并保留旧列作为兼容回退，不做删除式迁移。已有状态的人工提示词、图片、音频和显式 `referenceStateId: null` 不被覆盖。新角色默认带一个不可删除的初始状态；新增状态默认继承上一状态的年龄段与生图参考，状态描述可自动生成生图提示词，音色留空时沿状态链向前继承。服务端更新角色时必须保留首个状态，不能通过直接调用 API 删除或移动初始状态。
- **默认初始状态的唯一工厂**：`shared/types/novelReferenceExtraction.ts` 的 `createStoryCharacterInitialState` 是角色首状态的确定性来源；它按姓名、性别、年龄段和兼容旧字段生成可直接编辑的外观、图片提示词与音色提示词，不额外调用 AI。设定中心 CRUD、设定包批量落库、小说核心角色创建和角色库导入都必须把姓名等旧字段交给该工厂并直接写入 `statesJson`；服务端列表/更新归一化仍是最终兜底。客户端 `createInitialCharacterState` 只负责让创建弹窗提前看到同一份默认值，不能替代服务端归一化。
- **状态迁移的安全边界**：`parseStoryAssetStatesJson` 同时返回归一后的可读状态和 `canSafelyRewrite` 标记。只有 JSON 可解析、顶层为数组、已知字段类型正确且状态 ID/参考关系完整时，列表读取才允许把旧角色补成初始状态并回写；重复 ID、悬空 `referenceStateId`、损坏 JSON 或含非法字段的原始字符串保持不动，图片/音色生成也会停止并提示先在设定中心显式保存，避免读时迁移覆盖手工数据。服务端新建/更新会拒绝重复 ID 与悬空引用；状态图片、音色和表单保存使用 `statesJson` 条件更新与有限重试，只合并目标状态或最新运行时资产，避免并发请求互相覆盖。
- **外观状态（statesJson）**：Character/NovelScene/NovelProp 都用 `statesJson` 记录资产随剧情的形态（初始、换装、受伤、昼夜、破损…）。后续状态由用户在编辑弹窗的 `AssetStatesEditor`（assetForms.tsx，三类资产共用）手动增删改；角色状态表单包含状态名、年龄段、状态变化、图片提示词和音色提示词。每个状态可配置 **生图参考 referenceStateId**：参考同一资产的另一个状态的图（典型：新状态参考上一状态，长相不变只换装/加伤），或不参考直接生成全新形象。列表/创建/更新 API 均带 states（替换式数组），列表读取时会做增量状态归并。
- **状态编辑器的交互契约（2026-08-22 用户决定）**：左侧状态列表（缩略图+状态名，首个默认状态展示为“初始”）只用于选择与删除，「添加状态」在列表**底部**；右侧当前状态**字段行内直接可编辑**（状态名+年龄段或场景类型·时间·天气**同行**、图片提示词、音色提示词——**「状态变化」（description）输入框已移除**：状态名已能表达成因，UI 不再暴露该字段；保存时 `normalizeStatesForSave` 把空 description 回填为状态名、空 imagePrompt 回填为 description，校验只要求状态名非空；存量 description 数据保留并继续用于摘要/详情展示），无草稿弹窗、无只读态；图片与音色提示词用多行文本。**保存统一走弹窗底部「保存」（2026-08-22 用户决定）**——状态区不再有单独「保存状态」按钮，姓名/身份字段与全部状态一次落库；`normalizeStatesForSave` 从编辑器导出为模块级共用归一（校验状态名非空 + 空 description/imagePrompt 兜底回填），设定中心三个页签的 saveMutation 与漫剧提取 `applyOne`（新建/更新两条路径）都必须先过它再发 payload，否则新增状态空 description 会直接 400（zod min(1) 在服务端归一化之前）；**点「生成图片/生成音色/选取音色」仍会先自动保存未存状态再调生成**（`flushLocalEdits` 走 update API 只传 states），不需要先手动保存。区块不加「角色状态/场景状态/道具状态」标题。参考图选择在图片区（任意其他状态或留空生成全新形象，初始状态不可参考）。音色（仅角色）：「生成音色」合成新试听；旁边「选取音色」列出其他**已生成音色**的状态，点选即把该状态音色拿过来用（`generate-voice` 带 `sourceStateId`，显式选取失败直接报错、不回落参考链）；不再有「沿用上一状态」的隐式模式（服务端 reuse 不带 sourceStateId 时仍按参考链解析，仅为兼容旧数据）。漫剧「提取」弹窗对已存在资产复用同一编辑器，弹窗顶部「已存在」与资产类型是名字后的小标签、不单独占行（2026-08-22 用户要求紧凑）。
- **状态生成的后台契约与 UI 跟进（2026-08-22 实测定案）**：状态图/音色生成是 HTTP 请求内同步完成的——**客户端断连/关弹窗不会中断服务端**（实测：掐断连接后 22 秒服务端照样 done 落库）。排查「点了生成但界面没显示」先查 DB `statesJson` 里的 image/voice status，再怀疑生成链路；**真正会中断在途生成的只有服务进程重启**（ts-node watch 改文件重启），`interruptedStateHealer` 会在启动时把残留 generating 改写为 error。UI 跟进：`AssetStatesEditor` 挂与设定页签同一份列表查询（`queryKeys.novels.storySettings{Characters|Scenes|Props}`）——弹窗每次打开必 remount（Radix Dialog 无 forceMount），观察者挂载即触发一次后台 refetch（staleTime 0）拿到最新结果；任一状态 `image/voice.status=generating` 时 `refetchInterval=3s` 轮询到完成；表单干净（`!localDirty`）时把服务端 states 同步回表单（JSON 全等比较防循环），**用户未保存的修改永不被同步覆盖**；生成按钮反映服务端 generating 态（禁用 + 「生成中…」）。**残余风险**（暂不做服务端 merge）：表单 dirty 期间后台生成完成不回同步，此时整包保存 states 会把刚完成的 image/voice 从 statesJson 抹掉（磁盘文件成孤儿）——服务端 CAS 只保护同状态并发 patch，不保护旧基底整包替换；要彻底消除需 update 接口保留客户端载荷中缺失的服务端 image/voice。
- **状态图片提示词 AI 微调（2026-08-22 用户要求）**：`AssetStatesEditor` 图片提示词下方有一条「微调指令 + AI 改写」行——用户写一句要改的地方（如「去掉身上的伤」），`novel.state_image_prompt.tweak@v1`（structured，输出单条 imagePrompt，4～600 字与状态表单同上限）只改指令涉及的部分、其余逐字保留；imagePrompt 为空时按 kind/assetName/stateLabel+指令写一条新的。系统消息明确禁止添加四视图/全景/透视/画风/透明底等规格词——这些由生成链按资产类别自动注入，提示词只描述画面内容。路由 `POST /novels/:id/settings/state-image-prompt/tweak`（body：kind/assetName?/stateLabel?/imagePrompt?/instruction）是**纯文本改写、不读不写资产**，资产未保存（没有 id）也能用；`AssetStatesEditor` 因此新增必传 `novelId` 与可选 `assetName`（微调不依赖 `asset` prop）。结果只写回表单（`updateState` 置 localDirty，随「保存状态」或生成前的自动保存落库）。无关键词回落——改写失败直接报错，用户换说法重试。契约测试：server/tests/stateImagePromptTweak.test.js。
- **图片提示词只写纯内容描述（2026-08-22 用户决定）**：资产图片提示词（角色形象/场景环境/道具实物）**只描述画面内容本身**——角色写性别年龄段、发型发色、五官（脸型/眼睛/肤色）、体型、服装配饰、气质神态；场景写光线、空间结构、材质、氛围；道具写材质、颜色、造型、磨损。**画风（写实/动漫/CG/3D/虚幻引擎）、背景（纯白背景/白底/透明）、视图规格（四视图/全身像/特写/45 度透视/全景）一律禁止写进提示词**——分别由画风系统（通用画风+时代风格）、透明底/背景规则、四视图板式契约统一管理，写在提示词里反而会与系统注入的硬约束打架（用户实测：v8 之前解析出「写实动漫风格，纯白背景」与透明底要求冲突、画风词干扰生成）。落地点：`novel.chapter.reference_parse@v10`（角色/场景/道具三类 imagePrompt 指令都带禁止清单；**v10 起道具只写道具本身**——材质、颜色、造型比例、工艺细节、磨损痕迹、表面文字图案写具体写满，道具周围的环境与其它物品（抹布、桌面、木板等）一律不写，用户实测旧版本会把「旧抹布和积灰木板」写进银行卡的提示词导致成图混入额外物品）；微调 prompt（tweak@v1）改写时顺手删除这类多余词；生图链双防线——四视图板提示词声明「角色资料里的画风/背景词只是 metadata、不得覆盖透明底硬约束」，`buildStateImagePrompt`（场景/道具）同样声明状态提示词里的风格/背景/视图词只是内容描述。**道具生图只渲染道具本身（2026-08-22）**：prop 分支加「render exactly one prop, nothing else in frame」+「描述/提示词里的其它物品与环境是上下文、不得出现在画面」，negative prompt 追加 other objects/multiple objects/hands/table/cloth 等——即使存量提示词带环境词也不会把抹布、木板画出来。**存量旧提示词自愈（2026-08-22 用户再次实测：旧状态提示词仍带「全身像/写实动漫风格/纯白背景」）**：v10 之前解析写进 statesJson 的旧提示词不会自己消失——`shared/utils/imagePromptPurity.ts` 的 `stripAssetImagePromptNoise`（固定短语清单 + 边界前瞻防误伤内容词如 白底衫/动漫社；「XX风格的Y」连同「的」一起消费；「感」后缀词直接删除）在三个位置消费：① `normalizeStoryAssetStates`/`createStoryAssetInitialState`（shared，读/写统一——列表接口、状态编辑器、生成链拿到的都是剥过的文本，下次保存落库为干净数据；初始提示词来自旧角色 facePrompt 等字段同样过剥离；剥空回落 description）；② `novel.chapter.reference_parse@v11` postValidate（三类资产 imagePrompt 出口兜底，模型漏写也能剥掉，不触发重试）；③ `novel.state_image_prompt.tweak@v2` postValidate（改写出口同样兜底）。**时代氛围词（末世风格/废土感/玄幻氛围这类）也进禁写清单**——时代氛围由时代风格解析链注入（状态图：状态自选 eraStyle、未选默认「现代都市」；首帧图：剧情判定 > 全局链），提示词里写时代词会与注入的风格互相打架；契约锁定在 server/tests/imagePromptPurity.test.js。生图链的「提示词里的风格/背景词只是 metadata」防线继续保留作最后兜底。
- **状态图片生成（2026-08-19 起，四视图契约补充）**：`StoryAssetStateImage += { status, url?, prompt?, provider?, generatedAt?, error? }`（shared 契约）；`AssetStatesEditor` 每个状态一行「生成图」按钮（ImagePlus/RefreshCw），服务端 `StoryAssetStateImageService.generateStateImage`（modules/novel/story-settings/application）即时生成并读-改-写回 statesJson 的该状态 image 字段，返回更新后的资产 DTO。路由：`POST /novels/:id/settings/{characters|scenes|props}/:assetId/states/:stateId/generate-image` + 文件服务 `GET /novels/:id/settings/state-images/:stateId`（generated-images/story-state-images/:stateId/image.{ext}）。角色状态使用一次完整 sheet 请求，严格要求 `front_portrait → side_portrait → front_full_body → back_full_body`（正面头像 → 90°侧面头像 → 正面全身 → 背面全身）四个等宽原生 1280×720 面板；Grok Build 只接收文字提示词，不声称已上传 PSD/PSB，主链路不再四次独立生图后裁切拼接。有参考图时整张 sheet provider 路由到 Codex，并把同一参考图传给整张 sheet。角色提示词以稳定身份资料、年龄段、当前状态与角色画风为准，不再注入竖屏首帧提示词。场景/道具仍读取各自基础画面提示词再叠加状态变化；场景必须是纯空环境，叙事中的活体改写为环境痕迹并进入 negative prompt。规格请求仍使用 `IMAGE_SPECS.characterSheet`，Grok Build bridge 归一化产物为 1280×720。参考图只认 done 且有 url 的状态图。**坑**：assetStateSchema 是 `.strict()`——新增 image 字段必须进 zod schema，否则编辑弹窗保存（states 原样带回 image）会 400；客户端 onSuccess 用返回 states 覆盖本地编辑态，保证弹窗保存带回的是含 image 的最新数据。**坑 2（2026-08-22 用户实测「不能超过 2400 个字符」保存被拦）：服务端写入 statesJson 的字段必须能被路由 zod 原样带回**——`image.prompt` 存的是完整生图提示词，角色四视图单次生图的模板固定文案就 2500+ 字、加角色资料与风格行可达 5000+，超 zod 上限后生成成功但资产再也无法保存。规则：路由上限按生成侧真实规模定（image.prompt max 6000），写入侧 `pruneStateImage` 用同值常量截断（error 同步截到 600，音色 `buildVoiceErrorState` 同理）——「写入的必然能被带回」是硬不变量，改任一侧必须同步另一侧（契约锁定在 storySettingsCharacterStateRoute.test.js）。**状态图的消费方**：分镜首帧图（drama.storyboard@v4 的每镜 characterStates × 状态名单 → 状态图优先作角色参考图，见 comic-drama-workflow.md 状态→分镜→首帧接线节）。**展示破缓存契约**：状态图 URL 固定（同 stateId 覆盖存储）且文件接口带 24h 长缓存，任何前端展示方渲染状态图必须用 `buildStateImageSrc(url, generatedAt)`（从 `@/components/storyAssets` 导出）追加版本参数，否则重新生成后浏览器会停留在旧图；状态编辑器（`AssetStatesEditor`）、设定/漫剧资产详情弹窗与漫剧「提取」页签（同名建议卡片缩略图、已存在建议的弹窗直接载入已有资产进同一套状态编辑器）同走此口径。
- **场景状态图 = 等距柱状 360° 全景 + 全景预览（2026-08-22 用户要求）**：`buildStateImagePrompt` 的 scene 分支显式输出 equirectangular 全景指令（360° 全景/水平无缝环绕/整圈光线材质一致/地平线大致垂直居中/禁止边框与拼贴；措辞沿用旧版全景接口验证过的口径），尺寸走 `IMAGE_SPECS.scenePanorama`（通道归一为 16:9 也接受——viewer 按水平环绕映射，不要求严格 2:1）；「clean composition, strong subject focus」仅角色/道具保留，场景改用「整圈均匀细节」。前端 `client/src/components/common/PanoramaViewer.tsx`：**无第三方依赖**的 WebGL 反向等距柱状投影预览——NPOT 全景纹理只能 CLAMP_TO_EDGE + LINEAR（WebGL1 禁 REPEAT/mipmap），水平无缝环绕在片元着色器里用 `fract(u)` 完成；拖拽环视按 1:1 抓取感换算（pitch 限 ±~83°），滚轮调 30°~120° 视野，WebGL 不可用退回平面 `<img>`。`AssetStatesEditor` 中 scene 且已生成图时默认全景预览，右下角小按钮切「平面图」（LightboxImage，可开大图）；切换状态时复位为全景。旧场景状态图（普通构图）重新生成一次即变全景。
- **状态资产引用与音色契约**：`referenceStateId` 未提供时由 `normalizeStoryAssetStates` 按数组顺序补为紧邻上一状态；首状态补 `null`，显式 `null` 永远代表用户主动取消参考。状态图生成沿 `referenceStateId`/默认上一状态继续查找最近一个 `image.status=done` 的祖先图，不会因中间状态尚未生图而失去一致性参考。角色状态额外保存 `voice: { status, mode, sourceStateId?, sampleAudioUrl?, prompt? }`：上一状态链有已完成试听时默认 `reuse_previous`，复用只复制最近可用祖先的试听，不调用模型；选择 `generate_new` 时按当前状态音色变化、前序状态音色提示、旧角色音色的顺序合成固定试听短句（`STATE_VOICE_SAMPLE_TEXT`，2026-08-22 起沿用旧项目 mydrama 的参考文本「这是音色参考测试文本，请用自然、清晰、稳定的中文普通话读完。语速适中，吐字清楚，保持真实连贯的声音。」——用户实测原短句听不清，长句更容易听出吐字与节奏；与 DramaVoiceDesignService 共用，改动要两边同步）。状态音色路由为 `POST /novels/:id/settings/characters/:characterId/states/:stateId/generate-voice`，读改写时只替换目标状态并保留其他状态的图片与音频。
- **下游消费边界**：漫剧分镜的 `characterStates` 是镜头级状态选择，`DramaDialogueAudioService` 和 `DramaAudioSegmentsService` 必须用它覆盖角色基础音色；完成状态试听作为 `TTSGenerationRequest.referenceAudioUrl` 传给 `voxcpm2` 的 `metadata.audio_url`，并纳入 `voiceKey`，这样状态变化会把旧对白标为过期。配音默认 provider 为 `voxcpm2`，`mock` 只作为显式联调选项。首帧图参考默认开启，前端必须显式发送 `false` 才表示用户取消参考。
- **角色表单从简（2026-08-21 用户决定：从小说做视频）**：基础资料只留 姓名/性别；年龄段、外貌、画面提示词和音色提示词归入角色状态，新增状态只需填写状态名与一句状态变化，年龄默认继承上一状态，高级图片提示词与音色变化按需填写。旧角色通过状态归并兼容，旧列仍保留供迁移回退，不再作为新的角色资产编辑入口。性格/着装/背景仍不属于这套视频资产表单（DB 字段保留）。**身份定位（role）2026-08-21 起整体移出角色面**：参考小说只处理成脚本，定位男主女主没有消费方——提取不再输出（reference_parse@v5，strict 拒绝）、表单/卡片徽标/快捷新建不再出现、创建入参改可选（缺省存空串）；DB 列保留，AI 生成设定包（storySettingsBundle）仍会填 role，服务端把角色拼进提示词上下文时按「名字（定位）」空值容错（formatCharacterSummary）。
- **道具表单从简（2026-08-19 用户决定）**：道具就是 道具名 + 画面提示词（visualPrompt）两个字段——道具类型/持有者/重要度/剧情功能/首次登场提示对生成画面没有作用，全部移出表单、卡片、漫剧资产详情弹窗与提取应用弹窗。客户端-only 收敛：DB 与 API 契约不动（propType/importance 服务端缺省，仍可被 storySettingsBundle 批量生成填充）；编辑保存时把 description/plotFunction/ownerCharacterId/firstAppearHint 置 null 清空，propType/importance 不传保留旧值。预填折叠规则：编辑/AI 草稿/提取应用都是 `visualPrompt || description`——旧数据只写外观描述时带进画面提示词，不丢内容。漫剧大纲快捷新建里道具的一句说明直接作为 visualPrompt 落库。小说写作注入（storySettingsPromptText）对 null 字段本来就有容错，旧道具已保存的剧情功能在下次编辑保存后从注入文本中消失，属预期。
- **角色删除**：`DELETE /novels/:id/settings/characters/:characterId`。设定资产可直接删；被写作链路（状态账本/关系/时间线等 FK）引用的角色删除会被数据库拒绝（P2003 → 409 明确报错），不做级联删除。
- **场景与道具的状态字段归属**：场景基础资料只保留场景名；场景类型、时间、天气、环境描述和图片提示词都属于 `statesJson` 的具体状态。道具基础资料只保留道具名；外观描述和图片提示词属于道具状态。`NovelScene.timeOfDay/weather/sceneType` 与旧的 `summary/environmentPrompt`、`NovelProp.visualPrompt` 仍保留为兼容列，但保存和生图时以状态数组为权威，`normalizeSceneStates` 会把旧列一次性回填到初始状态，避免历史资产丢失。时间（morning/noon/night）与天气（sunny/cloudy/rainy）继续作为结构化枚举影响状态图光线与氛围；提示词统一在状态编辑器中显示为「图片提示词」，提取应用弹窗与设定中心共用同一套状态编辑器。

## 漫剧资产画风与状态图接线（2026-08-22）

### Background

设定中心的状态系统记录资产随剧情发生的外观变化；状态图片不是普通插画，而是下一次生图和分镜首帧使用的参考资产。因此状态图必须继承所属资产类别的视图规格，不能统一套用角色模板。

### Decision

- 角色基础信息为姓名与性别（2026-08-22 用户决定：**别名 UI 当天移除——用不到别名**，当天早上加的「别名」表单项/详情展示/脚本别名匹配与高亮全部下线，客户端不再读写 aliases）；年龄、样貌、图片提示词与音色相关内容继续放在角色状态里。**性别只有 男/女/其他 三项（2026-08-22 用户要求，下拉去掉「未设定」）**：「其他」容纳怪物等非人角色与看不出男女的形象；AI 解析（reference_parse@v12）的 gender 枚举同步收敛为 male/female/other（缺省与不明确的都归 other，不再输出 unknown，strict 拒绝）。**存量 unknown 的往返兼容**：老资产 statesJson 之外的角色列 gender 可能仍是 unknown，路由 zod（storySettingsRoutes / novelHttpSchemas）与服务端归一化枚举继续容忍该值——「写入的必然能被带回」，把 unknown 从枚举里删掉会让老资产保存被 400 拦截（与 image.prompt 超限同类的往返坑）；表单下拉不提供该选项，存量 unknown 在表单里显示为空、由用户重选。**别名数据契约（服务端保留兼容，前端已无入口）**：`Character.aliasesJson`（JSON 数组，如 `["哥哥","晨哥"]`，null=未设置）与 `normalizeCharacterAliases`（去空白/去重/剔除与本名相同项）仍在服务端生效；创建/更新 API 的 `aliases` 参数可选，**更新省略即保留原值、显式传 null/空数组才清空**（上限 12 条、单条 40 字），客户端现在一律省略；参考解析（reference_parse@v8 的 characterAliases 名单输入）与分镜 charactersDigest（`别名：…（输出一律用本名）` 行，DramaContextAssembler.loadNovelCharacterAliasesByName，drama 侧本地解析不 import novel 模块）继续对历史已存别名数据生效。若将来重新启用别名，恢复客户端表单与 ScriptTab 匹配即可，服务端链路无需改动。角色创建由状态工厂自动生成首个初始状态，后续状态由用户手动添加并可选择继承上一个状态。
- `StoryAssetStateImageService.generateStateImage` 根据 `kind` 选择 `styleContext.assets[kind]`：角色走四视图 sheet，场景走 360° 全景，道具走 45° 三点透视。
- 状态变化描述和参考状态链只影响当前状态内容与一致性；不能改变所属类别的固定规格，也不能把角色状态变成场景或道具图。
- 系统画风设置只保存三类正向覆盖，状态图、基础资产图和分镜首帧都从同一个解析上下文读取，避免页面保存后只有某一个入口生效。

### Current Rule

- 场景状态继续执行空环境规则，叙事中的人物、动物和怪物改写为环境痕迹；这条规则与场景画风的固定负面约束一起进入生成。
- 状态图写回仍使用 `statesJson` 条件更新和状态链参考解析，画风改造不得削弱既有并发保护、初始状态保护或图片保留规则。
- 设定中心页面负责编辑状态内容；画风管理页面负责三类资产的正向质感。两者不互相复制字段。

### Failure Modes

- 只修改状态编辑器而不更新生成服务，会出现状态图仍使用旧类别画风；任何新资产类别必须从状态生成入口验证。
- 直接把状态描述拼成可覆盖格式的自由提示词，会允许用户把四视图/全景/透视改成另一类资产；格式要求必须留在服务端固定配置。
- **旧版资产参考图兼容**：场景 360° 全景与道具 45° 透视图的旧接口、历史文件和 `imageData` 继续保留，避免旧数据失效；新的场景图片入口统一走状态图，首帧只读取场景初始状态图。三类状态图仍按 `StoryAssetStateImageService` 的类别规格生成：角色为四视图 sheet、场景为 360° 空环境全景、道具为 45° 单件透视。
- **资产参考图与状态图边界（2026-08-22）**：角色、场景、道具的正式图片都归属于 `statesJson` 的具体状态，三类资产统一使用 `AssetStatesEditor` 的左状态列表右详情布局；每个状态独立保存描述、图片提示词和状态图，右侧只展示当前选中状态的主图。场景的旧版 360° 全景图仍保留在 `NovelScene.imageData`、磁盘文件和兼容接口中，但不再作为场景编辑器或大纲详情的主图，也不参与首帧参考回落。`DramaShotKeyframeService` 只在场景初始状态图已生成时挂载它，未生成时仅注入环境提示词；道具旧版 45° 透视图仍由 `NovelProp.imageData` 兼容服务维护。状态图文件落 `generated-images/story-state-images/<stateId>/image.<ext>`，状态图生成路由为 `POST /novels/:id/settings/{characters|scenes|props}/:assetId/states/:stateId/generate-image`。**启动自愈覆盖状态图（2026-08-23 补齐）**：生成中服务重载/崩溃时 `statesJson` 里的 `image.status` 会停在 `generating`（前端无重试入口、永久「生成中」）；`interruptedStateHealer` 启动扫描现已包含 Character/NovelScene/NovelProp 的 `statesJson`（此前只覆盖漫画/分镜表），把卡住的状态图改写为 error 并给出「上一次生成被服务重启中断」；statesJson 解析失败的脏数据自动跳过（不碰 `canSafelyRewrite=false` 的原始状态）。契约锁定在 server/tests/interruptedStateHealer.test.js。**生成中可手动终止（2026-08-23 用户要求）**：路由 `POST .../states/:stateId/cancel-image`（三类资产各一）→ `StoryAssetStateImageService.cancelStateImage`：进程内 `inFlightGenerations`（key=`${kind}:${stateId}`）有在跑请求就 abort 其 AbortController 并等 error 态写回（`runImageGeneration` 的 `signal` 穿透到 provider 立即断开 HTTP，本地 codex 桥收到断开会同步杀掉 codex 进程，不烧额度不占并发槽）；无在跑请求但状态是 generating（重启残留/别的实例）直接改写为 error（`IMAGE_GENERATION_CANCELLED_MESSAGE`「已终止生成，可重新生成。」）。runner 在 signal.aborted 时写 error 态并正常返回（不走失败重试链），服务层再抛 400 终止提示给仍在等待的生成请求。前端在「生成中」按钮旁给「终止」按钮（`cancelStoryAssetStateImage`）。音色生成未接终止（时长短，暂无需求）。契约锁定在 server/tests/storyAssetStateImage.test.js（源断言）。**添加状态可选模板（2026-08-23 用户要求；同日二次调整=全量复制）**：`AssetStatesEditor` 的「添加状态」点开是模板选择（默认选中最后一个状态，可改选任意状态或「空白状态」）——基于所选状态创建时 `{ ...template, id, label, referenceStateId: template.id }` **全量原封不动复制**：内容属性（描述/图片提示词/音色提示词/eraStyle/年龄段或场景的时间天气/chapterOrder）连同已生成的 `image`（URL 指向模板状态自己的文件，沿用即可显示，重新生成时才写新状态自己的 URL）与 `voice`（试听/克隆链接同享）都直接拿来用；状态名在模板名后加数字去重（初始形象→初始形象2→初始形象3…）；`referenceStateId` 指向模板状态（重新生成时以模板的图锁同一形象，只画差异）。空白创建沿用旧行为（年龄段等结构化字段兜底取最后状态、参考指向最后状态）。
- **统一渲染媒介基线（2026-08-21；商业审美行 2026-08-22 改时代中立）**：角色、场景、道具的无参考图生成都使用同一套虚幻引擎 5 影视化游戏资产方向。角色四视图只改变视角槽位，不把“摄影棚模特/普通照片”当作展示媒介；场景保持空环境约束，道具保持单体资产约束。角色状态四视图的商业审美约束（**2026-08-23 调整：好看但要有辨识度**）：好看程度按角色身份与重要性伸缩（主角/重要角色明显好看，普通配角端正但不惊艳），长相必须来自角色资料自身的面部特征（脸型/眉形/眼型/鼻型/下颌/唇形/发际线/肤质，保留写明的痣疤等标记），资料不足时按身份补贴合的记忆点特征；**禁止把所有角色画成同一张「网红/偶像剧模板脸」**——旧版硬约束「对称五官+直鼻梁+干净下颌线的帅气男主」实测导致全书撞脸，已整体替换为 `APPEAL WITH DISTINCT IDENTITY`；不同角色之间不得共享同一张脸，负面词相应移除「五官不对称」（它逼向模板脸）并新增「网红脸、大众模板脸」；健康清爽、不得憔悴病态；状态/时代变化只换装不换脸，辨识度跨状态保持。**穿搭设计（2026-08-23 同日二次细化）**：渲染模板新增 `STYLING` 硬约束——服装发型配饰按角色资料原样完整呈现，资料穿搭细节不足时按性格/年龄/身份设计贴合人设的穿搭而不是统一默认装；**长相与穿搭的设计源头在提取侧**（`novel.chapter.reference_parse@v13`）：原文没写或写得笼统时按角色表现出的性格、年龄、身份推测设计（脸型/眉眼/鼻型/下颌/发色发型/肤质体态给具体值，可加痣疤眼镜等小标记；穿搭给具体单品与配色，女生锚点 地雷系/乖巧系/运动系/学霸系/通勤/街头/国风/哥特/Y2K，男生锚点 机能/运动/商务通勤/学院/工装/街头/复古，全书角色互相错开），好看程度按戏份伸缩（核心角色明显好看、配角端正但不惊艳、都不许难看）；`image.character.prompt_optimize@v2`（角色图提示词 AI 优化）同口径。**四视图模板不得写死任何时代氛围**——旧版模板里有一条「末世感只作用于表情、服装磨损和材质细节」（按末世书调的），与现代都市等时代风格打架，用户实测选了现代都市、提示词干净，图里衣服仍然又脏又旧；**角色身上的脏旧跟状态走、不跟时代风格走（2026-08-23 三次拆分，现行规则）**：这条规则三轮演进——①旧模板写死「末世感只作用于表情、服装磨损」（现代书被带出脏衣服）；②修正「时代风格不得自行添加磨损破败」矫枉过正，末世废土切换毫无画面变化；③「服装状态跟时代风格走」又让末世书所有角色无条件全身脏旧（想要干净状态做不出来）。现行规则：污渍/血渍/尘土/磨损/伤痕是**通用的角色状态属性**——战斗后带血、末世逃亡带尘土这类画面建对应的外观状态去描述，只由角色资料与当前状态描写决定，状态没写一律默认干净整洁；任何时代风格（含自定义）都不自动给角色添加污渍破败，只负责时代氛围与服装设计方向（换时代时款式/材质/配色按新时代明显重设计，切换仍要肉眼可见）。**「身上状态」结构化标签（2026-08-23 同日补齐；同日按用户反馈 8→5 合并近义标签）**：状态编辑器在「时代风格」旁提供多选标签（角色状态专用，场景/道具不显示）——血迹/脏污/破损/伤痕/烟熏（首版 8 标签里的 污渍/尘土/泥泞 并入「脏污」，磨损/破损 并入「破损」），存为 `StoryAssetState.wearTags`。契约三处同步：shared 白名单（`StoryAssetWearTag`/`STORY_ASSET_WEAR_TAGS`，迁移映射 `LEGACY_STORY_ASSET_WEAR_TAG_MAP`）、`CHARACTER_WEAR_TAG_PROMPTS` 短语表；HTTP 角色状态 schema 只做结构校验（数组），**枚举校验禁止放在守卫 `isStoryAssetStateRecord` 上**——守卫不认的值会把整个状态在读取时过滤掉（丢状态）；旧 id 迁移与白名单过滤统一在 `normalizeStoryAssetStates` 的 `canonicalizeWearTags`（读/写共用漏斗，已存的旧标签 id 自动迁成新 id 不丢勾选）。生图时服务端把标签按短语表渲染进四视图提示词的 `body condition (render exactly as described)` 行（旧单格视图路径同口径「身上状态」行），未知标签值直接丢弃；模板建状态的全量复制自动带上 wearTags；勾选为空/缺省＝干净整洁。内置「末世废土」预设同步拆分：风化/锈蚀/开裂混凝土等破败质感只施加在场景与道具等环境上；预设文本（正负两面）**完全不出现 污渍/血渍/血迹/尘土/泥/磨损 这类词**——预设文本会原样进角色/场景/道具/分镜提示词，负面枚举这些词反而容易被模型当成画面指令，边界只用「角色的服装与身体状态一律以角色资料与当前状态描写为准，本风格不改变角色的干净程度与身体状况」一句干净表达（dramaArtStyle.test.js 有 doesNotMatch 锁定）。时代风格只负责现代、末世、玄幻等氛围叠加，不能覆盖明确的资产内容。**参考图只锁身份，时代切换要大胆转变（2026-08-23 同上修正）**：有参考图时只保留同一张脸/发型/身材比例；参考图的服装材质与时代观感是「上一版样式」而非约束——当前风格方向与参考图不同时，服装/配饰/材质/氛围按新风格戏剧性转变（现代都市→末世废土必须是肉眼可见的大改），风格不变时才保留参考图的服装设计只改状态差异；角色的干净/脏旧同样只跟角色资料与状态描写走（never the style direction）；输出必须保留与参考图一致的透明底（genuine PNG alpha，编辑路径容易丢 alpha，显式锁住）；场景/道具的 `buildStateImagePrompt` 同口径（era look follows the current style direction / transform boldly，环境破败跟风格走）。契约锁定在 server/tests/characterStateSheet.test.js、dramaArtStyle.test.js 与 storyAssetStateImage.test.js。状态图缩略图使用 `generatedAt` 版本参数，点击图片进入独立大图预览，避免浏览器继续显示旧文件。

### 写作上下文注入（核心）

- 紧凑文本构建器：`story-settings/application/storySettingsPromptText.ts`，短篇与章节两条注入路径共用同一文本。
- 短篇：`shortStoryPromptContext.buildShortStoryWriterContextBlocks` 追加 `story_settings` 块（required，空设定不产生块）。
- 章节：`GenerationContextAssembler.assemble` 并行读取设定快照（`.catch(() => null)`，读取失败不得阻断章节生成）→ `GenerationContextPackage.storySettingsContext` → `buildChapterWriteContext.storySettingsPromptText` → `getAllContextBlocks` 渲染 `story_settings` 块。所有走该组装器的通道（简易/专业章节）在有设定数据时自动受益。
- 语义：设定块约束角色言行、场景氛围、道具功能、世界观规则“不得违背、可展开、不可推翻”。

### 短篇门槛与工作流

- 新增 `NovelWorkflowStage: short_story_settings` 与 `NovelWorkflowCheckpoint: settings_ready`（shared/types/novelWorkflow.ts），阶段/检查点文案映射在 `novelWorkflow.shared.ts` 与 `novelWorkflowExplainability.ts`。
- `ShortStoryProductionService.run()` 在 ensurePlan 之前执行 `runSettingsGate`：设定缺失 → 生成 → 记录 `settings_ready` 检查点并返回；齐全 → 直接进入规划。`recoverPending` 只恢复 queued/running，不会绕过检查点。
- 确认端点 `POST /novels/:id/settings/confirm`：清除检查点、重新排队，并由**路由层**调用 `shortStoryProductionService.schedule`（story-settings 服务不得反向依赖 short-story 模块，避免循环依赖）。

### 前端

- 共享组件 `client/src/pages/novels/components/storySettings/`：`StorySettingsTabs`（角色/场景/道具/世界观四页签）+ 四个 tab 组件 + `SettingsWorldMapView`；`assetForms.tsx` 是角色/场景/道具的共用表单字段组件——资产页签编辑弹窗与漫剧「提取」应用弹窗（`ExtractApplyDialog`）复用同一套表单，两边编辑体验必须一致（SVG 地图：多数节点有保存坐标时按坐标布局，否则环形布局；语义 token）+ `StorySettingsConfirmCard`（确认卡）。
- 短篇工作室：正文/设定二级页签 + 正文页顶部确认卡；简易书架页：创作/设定二级页签 + 续写前 ensureSettings。
- 遵循 novel-ui 规范：ui/tabs、Card、AiButton（AI 生成按钮）、toast、语义 token。

### 故事资产展示边界（2026-08-22）

角色、场景、道具在脚本右侧资产栏和设定中心页签中属于同一类“故事设定资产”，展示层必须共用 `client/src/components/storyAssets/`：`storyAssetPresentation.ts` 负责把三类 API 数据归一为卡片/详情模型，`StoryAssetCard` 负责可键盘触达的卡片入口，`StoryAssetDetailDialog` 负责基础信息、提示词、媒体和外观状态的统一只读展示。**2026-08-22 起：角色/场景/道具三个设定页签（含漫剧「资产」页签）点卡片直接打开各资产自己的编辑弹窗**（用户要求状态所见即编辑，只读详情中转被去掉）；`StoryAssetDetailDialog` 只保留给脚本右侧资产栏（OutlineSettingsAside）与提取弹窗的「已存在资产」只读展示。这样字段展示或状态信息增加时只改一处，脚本侧与设定中心不会再次分叉。

共用展示层不持有编辑、删除、缓存失效或生成请求；这些业务仍由脚本面板和三类设定页签分别管理，编辑时进入各资产类型自己的表单。角色库图片灯箱、图片生成确认弹窗和分镜首帧预览属于媒体/镜头流程，不接入故事资产详情弹窗，避免把不同生命周期的资源操作混成一个组件。

## 故障模式

- 设定生成失败：短篇任务走 `markTaskFailed`（可重试，重试会重新过门槛）；简易模式 ensure 失败仅提示、续写继续（不带新设定）。
- 部分类别落库后中断：下次 ensure 只补缺失类别，不会重复生成已有类别。
- 章节组装读取设定失败：被 catch 吞掉，章节照常生成（无设定块），排障时检查 `NovelSettingsWorld/NovelScene/NovelProp` 表与迁移状态。
- 确认后任务再次失败重试：检查点已清除，`retryTask` 会直接 requeue，重跑时设定齐全直接进入规划，不会二次卡确认。
- 双方言迁移：postgres 与 sqlite 各一份 `20260819120000_story_settings_models`，运行时迁移器启动时自动应用；新增列/表必须是纯增量。

## 相关模块

- `server/src/modules/novel/story-settings/`：设定中心服务与路由。
- `server/src/prompting/prompts/novel/storySettings.prompts.ts`：bundle 资产与 schema。
- `server/src/modules/novel/short-story/`：短篇生产链与 settings_ready 门槛。
- `server/src/services/novel/runtime/GenerationContextAssembler.ts` + `server/src/prompting/prompts/novel/chapterLayeredContext.ts`：章节注入链路。
- `client/src/pages/novels/components/storySettings/`：前端设定中心。
- 相关文档：`docs/superpowers/specs/2026-08-19-story-settings-hub-design.md`（设计）、`docs/wiki/product/`（新手优先决策）。

## 后续可选

- 导演链规划序列内的场景/道具生成步骤（替代简易模式的前端补全）。
- 设定与章节的关联追踪（某章发生在哪些场景、使用了哪些道具）。
- 专业工作台复用设定中心组件统一体验。


## 实体级 AI 生成（v1.1 追加）

- 属性结构参考旧项目 mydrama 的解析模型并反转方向：不从已有小说解析，而是按用户一句提示（可空=完全随机）现场生成。资产 `novel.story_settings.entity.generate@v1`，postValidate 强制只含请求的实体类型、姓名不与已有实体重名（角色名单以「名字（身份）」传入，比较时剥离括号后缀）。
- 图片提示词字段：角色 `facePrompt`（纯面部锚点，模板 `[性别]，[年龄段]，[发型发色]，[眼睛特征]，[肤色]，[脸型]`，禁止服装——与 mydrama 立绘生成共用同一约束思想）；场景 `environmentPrompt`（方位/光源/材质的空间描述，不含人物）；道具 `visualPrompt`（材质/工艺/尺寸/色泽/纹饰的固有外观）。这些字段是为后续「一键生成角色立绘/场景图/道具图」预留的锚点，正文生成不消费它们。
- 草稿不落库：generate 端点只返回草稿，前端填充表单供用户预览修改，保存走各实体 create 端点，避免产生垃圾行。
- 一致性上下文：生成时携带书名/题材/世界观摘要/已有实体名单，保证新实体融入本书而非凭空发明。


## 小说 → 漫画/短剧的基础角色库桥（v1.2 追加）

- 产品定位：设定中心的表面属性（性别/年龄段/体型/外貌/着装/面部锚点/性格）就是漫画与短剧改编的基础角色库；弧光等小说设计深字段只存在于专业工作台角色工作区，不进入改编链路，简易/短篇用户的正常流程也不会看到它们（simple 模式会被重定向到书架页）。
- 桥的落点：`SourceCharacter` 契约（`services/adaptation/contracts/sourceBundle.ts`）扩展 `ageGroup` 与 `facePrompt`；`NovelSourceAdapter` 先归一化 Character 的初始状态，再从状态映射年龄、视觉和音色，旧列只作为归一化回退（对齐旧项目 mydrama 的状态→资产消费顺序）。
- 漫画侧：`ComicProjectService.buildComicVisualAnchor`（已导出供测试）把 facePrompt 写入 `visualSpec.appearance` 的最前段，年龄段以中文标签进入锚点 description；短剧侧经同一 visualHint 自动受益。
- 改编仍是「一次性快照导入 + sourceCharacterRef 软引用」：导入后漫画角色与小说角色解耦（可拆分保证），小说侧后续修改不会自动同步——这是既有架构决策，如需再同步应走显式的重新导入。


## 世界地图工作台（v1.3 追加；v1.4 画布化；v1.6 三层级+AI 场景标注；v1.7 纯画布两级切换；v1.9 单层场景地图=当前形态）

- **地图是数据不是图片**：`NovelSettingsWorld.mapJson` 存 `{ overview, scaleKm, terrain, nodes, edges, childMaps }`——`x/y` 与地形顶点都是 0-100 平面百分比坐标。**刻意不走 AI 生图**。
- **v1.9 单层场景地图=当前形态（2026-08-21 用户决定）**：地图不再按 国家→城市 分层，也没有层级切换/下钻/国家下拉——**一张平面画布，节点就是场景资产**。「生成地图」= 把还没放上画布的场景交给 AI（`novel.world.map_annotate@v4`）估算相互位置关系后摆上来；地图还没有地形时顺便生成地形分区。理由：漫剧的生产单元是场景，国家/城市层级对新手是多余的结构负担，AI 编国家名还容易跑偏世界观风格；场景名本身来自章节，不需要再发明一层地名。层级相关代码已删（MAP_LEVELS/LEVEL_SCALE_KM/mapAtPath/面包屑），**childMaps 与 country kind 只做旧数据兼容**：读取归一时保留（容忍 PUT 往返）、UI 不再展示也不再写入新层级。
- **场景「已放置」按根图判定（迁移自愈）**：`NovelScene.mapNodeId` 指向**根图**存在节点才算已放置；旧层级数据里挂在 childMaps 内部节点上的场景视为未放置，下次点「生成地图」会重新摆到根图（旧 childMaps 数据留在库里不展示，随用户删节点逐步清理）。没有场景资产 → 400 引导先去「解析 → 提取」应用场景；所有场景都已放置/标记无法定位 → 400 提示新增场景后再生成。
- **v1.8 画布换成 React Flow（2026-08-21 用户要求，搬自旧项目 mydrama）**：`MapFlowCanvas`（@xyflow/react@12）提供点阵背景、滚轮缩放、拖拽平移、右下小地图；节点是卡片（`MapFlowNodes.MapCardNode`：色条+名字+说明；v1.9 起无下级数），地形多边形渲染成不可拖的背景层节点（`TerrainLayerNode`，pointer-events 关闭，点击空白处经 `screenToFlowPosition`+射线法命中选中）。**数据模型不变**：MapFlowCanvas 内部把 0-100 百分比按基准画布 1600px 换算成 React Flow 像素（node.origin [0.5,0.5] 让 position 即中心），拖动结束换回百分比上抛。旧纯 SVG MapCanvas 已删除。用户反馈小圆点 SVG「太抽象不像画布」——mydrama 的画布体验（自由缩放平移+卡片节点）是这次搬迁的参照。v1.8.1 打磨：画布铺满剩余高度（外层 Card 与画布下方提示行移除）；小地图节点显示地名（自定义 nodeComponent，fontSize 用 flow 单位大字号补偿 minimap 缩放）；当前级搜索框（不匹配卡片 opacity 0.15 淡出、相关连线同淡；v1.9 起占位符「搜索场景」）；生成按钮文案「生成地图」。
- **v1.6 三层级（2026-08-21 用户决定，v1.9 已废弃层级）**：层级语义按 childMaps 深度约定——世界层 nodes=国家（kind=country）、国家层 nodes=城市（kind=city）、城市层 nodes=具体地点（kind=building，即场景，`NovelScene.mapNodeId` 指向节点 id）。前端按 `MAP_LEVELS`（mapData.ts）渲染层级文案与默认 kind。
- **v1.7 纯画布两级切换（2026-08-21 用户决定，v1.9 已改为单层）**：交互=塞尔达式大地图——顶部切换条「国家级别 / 城市级别」；国家级别=世界画布（各国分布），城市级别=选定国家的城市画布（旁边国家下拉切换），点城市再下钻一层看城内地点（面包屑 国家 › 城市 回退）。画布上点国家/城市节点=直接进入下级，点地点=选中编辑；MapCanvas 用位移阈值区分点击与拖拽（原地松开=点击）。**所有工具栏按钮与右侧列表全部移除**（AI 标注场景、保存/已保存、画地形、添加节点、LevelListCard）——画布占满整行，点选节点/地形后编辑卡（NodeEditorCard/TerrainEditorCard）出现在画布下方、未选中不占位；改动（拖动/改名/删除）1.5s 防抖自动保存（成功静默、失败 toast），地图数据当前没有 UI 新建入口，内容来源=解析流程或服务端标注端点。
- **地理尺度（v1.7 内置，v1.9 已随层级一起移除）**：曾用 `LEVEL_SCALE_KM = [5000, 2000, 40]` 在连线上标公里数；单层场景地图没有固定地理跨度（一本书的场景可能同城也可能跨国），公里标尺与连线 km 标注已删，mapJson 的 scaleKm 字段保留在数据里只是兼容字段。
- **AI 标注地图（novel.world.map_annotate@v4，2026-08-21 单层化重写）**：一个动作一种语义——把 pending 场景（mapNodeId 不指向根图节点且 `mapUnmappable=false`）交给 AI 估算相对位置，输出 `placements`（sceneName+x/y+kind：city/region/building/wild/other，节点名=场景名、summary=场景摘要）与 `unplaceable`（无法定位的写 `NovelScene.mapUnmappable=true` 下次跳过）；**terrain 仅当 mapJson 还没有地形时输出**（3～8 个粗多边形 plain/mountain/water，postValidate 按 `terrainEmpty` 输入硬校验），已有地形后再也不动。传给 AI 的上下文=根图已有节点（名字+坐标，供新场景参照摆放）+ premise/era/keySettings。没有场景/全部处理完 → 400（见上）。合并走 `mergeAnnotation`（纯函数：同名地点沿用已有节点不覆盖人工坐标，其余只追加）后直接落库；误标注的解除=删除地图节点（`applyWorldMap` 清场景挂点回未放置态）。**命名风格约束只作用于地形 label**（v3 起的硬约束延续：地形名贴合 era/premise/keySettings 的世界观风格，现代世界不出现「荒原/王庭/秘境」这类玄幻词，虚构地名不用真实地名）——地点名=场景名不再由 AI 命名。前端入口=WorldMapPanel 顶栏「生成地图」+ 空画布中央同款按钮。
- **node id 稳定是硬契约**：AI 标注按名称对齐已有地点沿用原节点（`mergeAnnotation`），`NovelScene.mapNodeId` 的引用因此不丢；保存时被删节点会把引用它的场景挂点置空（`applyWorldMap` 的 updateMany）。
- **端点**：`POST /novels/:id/settings/world/map-annotate`（标注并落库）+ `PUT /novels/:id/settings/world` 的 `map` 字段（`worldMapUpdateSchema`，zod z.lazy 递归校验 childMaps）。路径含 `/settings`，简易模式写守卫天然放行。归一逻辑（坐标夹紧/重复 id/悬空连线剔除/地形≥3 点/childMaps 挂点必须指向真实节点/深度三级/每图节点 48 上限——上限要容得下一次标注的批量场景，静默截断会丢标注结果）在 `WorldMapService.normalizeWorldMap`，纯函数、契约锁定在 `tests/worldMapContract.test.js`。
- **漫剧侧世界观只读（2026-08-21 用户决定）**：漫剧工作室「设定 · 世界观」用 `WorldSettingsPanel` 只读展示关键设定条目（可删误提取）——条目唯一来源是章节解析（referenceParse 提取 worldview → 「提取」页签应用 → `updateStorySettingsWorld({ keySettings })` 追加，keySettings zod 上限 200 条）。不再提供 AI 生成世界观/基础设定编辑/保存按钮（小说侧 `SettingsWorldTab` 保持原样不动）。premise/era 数据仍在（解析与其他 AI 流程还读它），只是漫剧 UI 不再编辑。
- **AI 生成世界观（regenerate world）会覆盖地图节点吗**：bundle 资产一次生成含 mapLocations 的完整世界观，regenerate world 类别整体覆盖（既有规则，且 bundle 写入的旧格式不含地形/childMaps）；地图工作台的人工编辑保存在同一 mapJson，重新生成世界观会覆盖它——排障时先确认用户是否在小说侧点过「AI 生成世界观」。

## 美术风格（v1.8：两层组合 + 全中文指令 + 脚本切换时代风格）

- **两层组合（2026-08-21 用户决定）**：画风 = **资产画风**（系统级渲染质感基线：角色/场景/道具三类各自的固定规格 + UE5 级 3D 写实渲染质感，**不含任何时代/题材属性**——现代/末世/玄幻都由另一层叠加；自定义存 AppSetting `drama.assetArtStyles`，入口在独立「画风管理」页）+ **时代画风**（题材/氛围层：全局库——内置预设或全局自定义，如 现代↔末世、现代↔玄幻 切换）。首帧图与角色立绘提示词按 资产→题材 顺序拼接、negative 两层合并，统一解析入口 `services/drama/visual/dramaArtStyleResolver.ts`（注入点 DramaShotKeyframeService / DramaCharacterImageService）。拆层原因：v1 预设把「渲染媒介」和「时代题材」混在一条里，同一本书换题材时画质跟着跳；拆开后媒介恒定、题材可切。
- **风格指令全中文（2026-08-21 用户决定）**：资产画风与全部预设的 `styleInstructions`/`avoidInstructions`/`styleTag` 统一中文书写——自定义画风路径本就是中文、分镜与场景描述也是中文，管道按中文提示词运转；用户明确要求界面与风格内容尽量中文。tests/dramaArtStyle.test.js 锁定「内置指令不含成句英文」。
- **画风管理独立页 + 时代画风全局库（2026-08-22 用户决定）**：「画风管理」从系统设置里拆出成独立顶级页 `/art-style`（侧边栏「系统」组入口；`/settings/art-style` 重定向），一张页管两件事：①**资产画风**——角色/场景/道具三张卡（正向画风可编辑、固定规格与禁区只读，接口 GET/PUT `/api/settings/drama-asset-styles`）；②**时代画风**——内置预设只读展示 + **全局自定义时代画风**增删改（全量替换保存，接口 GET/PUT `/api/drama/era-styles`，服务 `eraStyleLibrary.ts`，存 AppSetting `drama.eraStyles` `[{label,prompt}]`，label≤20、prompt≤500、≤24 条、禁止与内置预设 id/label 重名）。**时代画风不再按书定义**：小说/漫剧项目只引用全局库的名字——脚本页签顶部【画风：名】标记切换、外观状态按状态选 eraStyle、分镜项目 visualStyle（2026-08-22 起项目画风校验放行全局自定义风格名，不只内置 id）。GET /drama/visual-styles 一并返回内置预设 + 全局自定义（自定义项 id=label、styleFamily="custom"），脚本/状态下拉都只消费这一个来源。旧的书内自定义 `NovelSettingsWorld.artStylesJson` 管理入口已移除（漫剧「设定」页签的「美术风格」子页签与 ArtStylePanel 组件已整体删除——2026-08-23 用户要求清干净：画风管理独立成页后项目内不再保留任何画风面板），数据保留只读兼容：解析时并入匹配（同名时全局自定义优先，`loadEraStyleRecord`）；`defaultArtStyle` 仍按书读取作为链路层（旧数据，无 UI 写入入口）。契约锁定在 server/tests/eraStyleLibrary.test.js。
- **内置预设不入库**：`services/drama/visual/dramaVisualStyles.ts`——2026-08-21 起为 6 项**题材叠加层**（现代都市/末世废土/东方玄幻/现代诡异/古代年代/民国年代，默认 `realistic`），渲染媒介词一律不进预设（媒介由资产画风决定，tests/dramaArtStyle.test.js 锁定）；旧版媒介预设（动漫/3D写实电影/真人实拍系措辞）随两层拆分移除，存量 defaultArtStyle 引用由 `updateWorld` 悬空检测自动回落。
- **风格身份=名字**：自定义风格没有独立 id，label 就是身份——时代画风引用与展示都用同一个名字（改名=换身份；全局库里同名即同风格，删除被引用的自定义风格时解析侧按悬空引用回落对应链路）。`parseArtStyles`（书内遗留）与 `parseDramaEraStylePayload`（全局库）读取时同名去重。
- **状态自带时代风格（2026-08-22 用户要求，解析优先级第 0 层；同日二次调整：空值=默认现代都市，不再按剧情判定；同日三次调整：悬空也回落现代都市，与设定处彻底隔离）**：`StoryAssetState.eraStyle`（存预设 label 或自定义风格名，空=按内置「现代都市」预设出图）。双穿/时代推进的书（如 道鬼异仙 型 现代↔玄幻 反复切换）同一资产在不同时代各有一套状态：现代形态的状态选「现代都市」、玄幻形态的选「东方玄幻」，跨时代保持同一形象靠既有的 referenceStateId 参考链（新状态默认参考上一状态，长相一致只换时代氛围）。生成状态图时 `StoryAssetStateImageService` 把它作为 `pinnedStyle` 传给 `resolveDramaArtStyleContext`：命中可选风格（内置预设+全局自定义，2026-08-22 起含旧书内遗留）就直接采用，**跳过剧情判定与全局链**（用户显式选择是确定性输入，不需要再判）；**未选时兜底 `DEFAULT_DRAMA_VISUAL_STYLE_ID`（realistic=现代都市）——用户明确要求下拉不提供「自动」、空值不再做剧情判定**（要切时代就直接在状态上选，确定性优于猜）；**悬空引用（自定义风格已删）也固定回落「现代都市」（`pinnedMissFallbackStyle`）——设定处的时代风格（章节脚本【画风】标记、小说 defaultArtStyle）完全不影响状态图**（用户实测怀疑设定默认风格仍被使用后要求的彻底隔离；其他调用方不传该参数时悬空仍回落常规链）。编辑入口在状态编辑器「状态设定」区（下拉：预设 + 全局自定义，未选显示「现代都市」，选项来自 GET /drama/visual-styles）；路由 zod `eraStyle` trim≤40 可空。契约锁定在 server/tests/dramaAssetArtStyleSettings.test.js 与 server/tests/storyAssetStateImage.test.js（源断言：pinned 兜底 + pinnedMissFallbackStyle + 无 scriptJudge）。
- **时代风格按剧情判定（2026-08-22 用户决定，优先级第 1 层；同日范围收窄：只剩分镜首帧在用）**：书的时代风格是全局值，但故事有时代推进（开篇现代、章末才进末世）——生成时不能拿全局风格一刀切。带剧情上下文的生成点（**当前只有分镜首帧图** DramaShotKeyframeService；资产状态图当天被用户改为固定走第 0 层兜底，`StoryAssetStateImageService` 不再传 scriptJudge）会把该故事节点的剧情文本交给 `drama.visual.era_style_judge@v1`（美术监督判定：只看这段文本描述的「当下」，线索不明回落 defaultKey，styleKey 必须出自可选清单=内置预设+自定义风格），命中则覆盖全局链结果；判定失败/无上下文回落原链路，绝不阻塞生成。首帧图的上下文=本镜地点/画面/台词 + 所在集正文窗口，逐镜判定（切换场景即可能换风格）。入口都在 `resolveDramaArtStyleContext` 的 `scriptJudge` 参数（judgeFn 可注入测试）。设定里的时代风格保留：它定义可选清单与默认值，不再是每次生成的唯一取值。
- **画风解析链**：时代风格完整优先级 = **状态自选 eraStyle（pinnedStyle，仅状态图；未选兜底内置「现代都市」预设）** > **剧情判定（scriptJudge，仅分镜首帧）** > 全局链（本条）。全局链（2026-08-21 用户决定：脚本切换是主入口，切换后后面都用新的）= **章节脚本【画风：名】标记**（从最新章节往前找最近一次标记——本章无标记=沿用上一次，即"新章节沿用上一章风格"；标记行格式与解析锁定在 shared/utils/scriptDocument.ts + tests/scriptDocument.test.js，标记名=预设 label 或自定义风格名，匹配函数 `matchDramaEraStyle` 兼容历史存的预设 id）> `DramaProject.visualStyle`（手动选择/创建时写入）> 小说 `defaultArtStyle` > 内置默认（预设列表首位）。「脚本」页签顶部有画风下拉：切换即在脚本末尾追加一条【画风：名】标记（走章节 expectation 自动保存链路）；GET /api/drama/era-style/:novelId 返回当前生效风格与来源（script/novel-default/builtin）供 UI 显示。小说默认→项目的同步推送入口随项目内画风面板移除（2026-08-22）；项目自己的画风用 POST /api/drama/projects/:id/visual-style 设置，校验放行内置预设 id 与全局自定义风格名。**生成侧（首帧图/立绘）**统一走 `resolveDramaArtStyleContext({ visualStyle, sourceRef })`：先查脚本标记，再 visualStyle/defaultArtStyle，都没有则只用资产层。注意：分镜镜头与脚本行没有位置级关联，标记的生效粒度是**生成时刻**（切换后新生成的画面用新画风），不是按镜头位置回溯——按位置精确映射需要先建 expectation→shot 链路，属后续工作。
- **画风不进「AI 解析」（2026-08-20 决定，2026-08-21 部分反转）**：v7 曾让 `reference_draft` 输出 styleSwitch（【风格：…】标记）按剧情切画风，用户看过实际产出后决定不要 AI 自动切画风；v8 起契约无 styleSwitch/artStyles。2026-08-21 用户要求**手动**在脚本里切画风（【画风：…】标记由用户在「脚本」页签插入，AI 解析不产出），与 v7 的区别是控制权在用户手里。**角色状态切换保留**：`stateSwitches`（【角色状态：名字：状态】标记）仍在脚本里输出——v4（2026-08-21）起**登记过状态的角色首次出场即写起始状态标记**（默认用 characterStates 名单第一个状态，即初始形象）：开场没有基准状态，后续切换就没有起点（用户实测第一章开头主角无状态）。其逐镜消费是画面生成侧的后续工作——做的时候解析标记行的位置在 Chapter.expectation 文本（`serializeDraftSegments` 的输出格式）。
- **世界观基本设定精简（同一时期决策）**：基本设定只留 世界前提 + 时代背景（前端下拉：古代/架空古代/民国/现代/近未来/未来/末世/异世界 + 自定义自由输入，存量非名单值自动转自定义态）；基调规则（toneRules）不再提供编辑入口——世界规则一律走关键设定条目（条目式更符合写作新手的心智）。存量 toneRulesJson 数据保留不删，AI 重新生成世界观仍读它，属可接受的遗留输入。
- **提取建议的应用态与道具门槛（2026-08-23 用户要求）**：「提取」页签的应用成功后**建议保留在列表**并亮「已存在」徽标（旧版把已应用条目从 `Chapter.referenceExtractionJson` 里删掉——用户应用后回看不到提取结果、不知道哪些建过；徽标靠 `existingNames`（资产名单缓存）驱动，应用成功 `invalidateStorySettingsCaches` 刷新后自动亮，再点开走已有资产更新路径，同名兜底拦重复创建；重新「解析」仍整份重写建议）。**道具提取按复用度过滤（reference_parse@v14）**：只收反复出现或直接推动关键情节的贯穿性道具；行李箱/背包/糖果零食/银行卡/手机/普通衣物餐具这类只在个别分镜用一下的通用日常物品一律不收（用户实测第一章提出一堆低复用道具——换个故事也一样用，单独建形象没有价值，本章没有就返回空数组）。契约锁定在 server/tests/chapterReferenceParse.test.js。
- **解析耗时元数据 parseDurationMs（2026-08-23 用户要求）**：`ReferenceExtractionPayload.parseDurationMs`（毫秒）是随提取结果持久化在 `Chapter.referenceExtractionJson` 里的**前端元数据，AI 不产出**——解析成功落库时由 `useReferenceDraftStage` 写入（`JSON.stringify({ ...extraction, parseDurationMs })`），「参考」页签解析中显示实时秒数、完成后显示「上次解析 X」，刷新/换章后从章节读回。契约要点：读取链路 `normalizeExtraction`（useReferenceExtractStage.ts）**必须保留该字段**——它重建 payload 对象时丢掉未知字段的写法会静默吃掉耗时；服务端对 referenceExtractionJson 只做不透明存取不解析，字段契约全在客户端。契约锁定在 server/tests/chapterParseDurationContract.test.js。
