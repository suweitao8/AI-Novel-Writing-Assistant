# 漫剧角色状态图片与音色资产设计

## 背景

漫剧 Studio 的“资产 → 角色”实际编辑小说 `Character`，角色的外观状态保存在 `statesJson`，脚本解析会登记状态，分镜首帧也已经按状态读取状态图。当前链路仍有三个断点：

1. 状态编辑器把状态详情和操作挤在状态列表中，没有独立的状态编辑区；状态图虽然有按钮，但编辑状态后可能丢失已经生成的图片字段。
2. 角色状态只有 `voicePrompt` 文字，没有状态级音色试听/生成结果，也没有把状态音色传给漫剧台词合成。
3. 新状态没有稳定的参考默认值；“没有配置参考”和“明确选择不参考”没有区分，导致无法实现“默认沿用上一个形象、主动留空才不参考”。

## 目标

- 在角色编辑弹窗内提供左侧状态列表、右侧状态详情面板。
- 右侧面板展示当前状态的图片、状态名、基础描述、图片提示词、音色提示词和生成状态。
- 状态图默认引用同一角色的上一状态图；用户选择“不参考”后持久化为 `null`，生图请求不携带上一状态参考图。
- 状态音色默认沿用上一状态的已生成试听；当用户选择“生成新的音色”时，使用当前状态音色提示词（缺省回落角色基础音色提示）调用现有音频模型槽位并把试听音频落到当前状态。
- 分镜台词生成和音频状态投影按镜头的 `characterStates` 读取角色状态音色，并把状态试听作为 VoxCPM2/HTTP TTS 的参考音频；状态音色变化会让已有台词标记为过期。
- 保持 `statesJson` 为唯一状态来源，不新增 Drama 专用状态表，不让 `DramaCharacter` 与小说角色状态形成第二套编辑数据。

## 非目标

- 不重做现有角色基础资料字段，不迁移已有角色表。
- 不让状态图片或状态音色自动覆盖前一个状态的产物；“沿用”保存的是当前状态对来源状态的快照引用与试听地址。
- 不把状态音色生成改成新的 Prompt Registry 业务 Prompt；它使用现有 `synthesizeAudioSpeech` 音频槽位，不新增 LLM 意图判断。

## 数据契约

在 `shared/types/novelReferenceExtraction.ts` 扩展状态契约：

```ts
type StoryAssetStateVoiceMode = "reuse_previous" | "generate_new";

interface StoryAssetStateVoice {
  status: "idle" | "generating" | "done" | "error";
  mode: StoryAssetStateVoiceMode;
  sourceStateId?: string | null;
  sampleAudioUrl?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

interface StoryAssetState {
  id: string;
  label: string;
  description: string;
  imagePrompt: string;
  voicePrompt?: string;
  chapterOrder?: number;
  referenceStateId?: string | null;
  image?: StoryAssetStateImage;
  voice?: StoryAssetStateVoice;
}
```

`referenceStateId` 的三种状态：

- `undefined`：兼容旧数据，按状态顺序推导上一状态；保存或返回时归一化为上一状态 id（首状态为 `null`）。
- 一个状态 id：明确引用该状态的已生成图片。
- `null`：用户明确选择不参考，不能被默认归一化覆盖。

状态音色的默认模式按状态顺序推导：存在上一状态时为 `reuse_previous`，首状态为 `generate_new`。执行“沿用上一状态”时必须找到上一状态的 `voice.status=done` 且有 `sampleAudioUrl`；找不到时返回可读错误，不偷偷调用生成。执行“生成新的音色”时优先使用当前状态 `voicePrompt`，为空才使用角色的 `voiceTexture`。

## 服务端数据流

### 状态图片

`StorySettingsService.parseStates` 统一做状态引用归一化；`StoryAssetStateImageService` 在生成时使用同一份有效引用解析。状态图生成路由仍为：

`POST /api/novels/:novelId/settings/characters/:characterId/states/:stateId/generate-image`

服务端只在明确存在已完成参考图时传 `refImages`；`null` 或没有可用参考图时不传。图片生成完成后只更新目标状态的 `image` 字段，并保留其他状态、图片和音色字段。

### 状态音色

新增角色状态音色路由：

`POST /api/novels/:novelId/settings/characters/:characterId/states/:stateId/generate-voice`

请求体：`{ mode?: "reuse_previous" | "generate_new" }`，缺省为按默认模式执行。

新增 `StoryAssetStateVoiceService`：

- 校验角色、状态和状态顺序。
- `reuse_previous` 复制上一状态已完成的音色快照，并记录 `sourceStateId`。
- `generate_new` 调用现有 `synthesizeAudioSpeech` 固定试听短句，透传角色名和状态音色提示词，保存 data URL 到当前状态。
- 失败时把目标状态的 `voice` 置为 `error` 并保留可重试信息；不改动其他状态。

### 下游配音

`DramaContextAssembler.loadNovelCharacterStatesByName` 继续作为小说→漫剧状态读取入口。新增纯解析函数把 `DramaCharacter` 基础音色与镜头 `characterStates` 的状态音色合并：状态有已完成试听时覆盖 `emotion`、`referenceAudioUrl` 和音色指纹，否则回落 Drama 角色基础音色。

`TTSGenerationRequest` 增加 `referenceAudioUrl`，VoxCPM2 和 HTTP TTS 都透传；`buildDialogueVoiceKey` 纳入参考音频地址，状态音色改变后已有音频被标记为 `stale`。批量 TTS 无显式 provider 时使用已注册的 `voxcpm2`，保留 `mock` 供联调和测试显式选择。

## 前端交互

`AssetStatesEditor` 在角色编辑弹窗中使用响应式两栏：

- 左栏：状态列表、缩略图、参考状态徽标、音色状态徽标；点击状态切换右栏，添加状态后自动选中。
- 右栏：当前状态的图片预览、状态基础字段、图片参考选择、状态音色模式选择、音色提示词、图片/音色生成按钮和音频播放器。
- 新增/编辑中的未保存状态不可调用服务端生成；保存角色后即可生成。异步操作有禁用、加载、成功、错误反馈，生成按钮使用项目现有 `AiButton` 和 `toast`。
- 图片参考选择默认上一状态，选“不参考”持久化 `null`。
- 音色模式默认上一状态；首状态没有可复用音色时显示“生成新音色”。点击“沿用上一状态”不调用模型，点击“生成新的音色”才调用音频服务。

角色编辑弹窗扩大为可容纳两栏的 `AppDialogContent`，窄屏退化为上下布局；继续使用语义 Tailwind token、现有 `Input`/`SelectControl`/`Card`/`Button`/`AiButton`，不新增 UI 依赖。

## 测试策略

- shared/server 契约测试：状态引用默认/显式取消、状态音色默认模式、复用来源校验、新音色请求参数。
- story settings 路由/服务测试：生成新音色落库、复用音色不调用模型、图片生成保留 voice/image 旁路字段。
- drama 音频测试：状态音色覆盖基础音色、参考音频透传、状态变化导致音频 stale。
- client 静态契约测试：右栏状态面板、图片与音色操作入口、默认值和生成字段保留。
- 聚焦测试后运行 shared build、server build/typecheck、client typecheck/build；运行服务后做 API 检查和真实浏览器流程：编辑角色 → 选择状态 → 生成图片（默认参考）→ 取消参考再生成 → 沿用音色 → 生成新音色。

## 错误处理与兼容

- 无音频服务、未配置图片 provider、参考图不存在、上一状态没有已生成音色均返回明确错误并允许重试。
- 旧 `statesJson` 不含 `image`/`voice`/`referenceStateId` 时按兼容规则读取，不清除已有字段。
- 不执行数据库重置或破坏性迁移；本需求只扩展现有 JSON 契约。

