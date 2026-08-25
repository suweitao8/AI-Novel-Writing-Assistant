# VoxCPM2 音频主通道恢复设计

## 背景

当前音频模型槽位已经切到 IndexTTS 2.5，但项目原有的旁白、角色音色设计、分镜对白和批量配音链路是按 VoxCPM2 的 OpenAI 兼容桥实现的。IndexTTS 相关实现还保留在仓库中，但当前开发环境需要先恢复一条稳定的 VoxCPM2 全链路，避免设置页和分镜配音继续依赖 9005 端口的 IndexTTS 服务。

## 目标状态

- 音频模型槽位默认 provider 为 `voxcpm2`，默认地址为 `http://127.0.0.1:18761/v1`，模型为 `voxcpm2`。
- 根目录开发启动和服务端直启都通过幂等启动器确保 `D:\Github\VoxCPM\openai_speech_server.py` 已在 18761 端口就绪。
- 公共合成入口继续是 `synthesizeAudioSpeech`，VoxCPM2 请求使用 `/v1/audio/speech`、`model/input/metadata` 协议，并保留旁白/对白/内心独白语义、情绪提示、角色名和参考音频。
- `TTSProviderPort` 默认注册并解析 VoxCPM2，旁白、角色对白、状态音色试听、设置页试听、批量配音都走同一默认通道。
- 旁白设置页恢复为通用 VoxCPM2 音色描述和试听入口，不再查询 IndexTTS 音色目录或上传到 IndexTTS 音色库。
- 旧的 IndexTTS provider、协议适配、目录接口和历史设置字段保留为非默认兼容代码；它们不会被默认音频槽位、开发启动器或当前设置页调用。

## 兼容策略

- 不修改或重置数据库，不删除已有旁白、角色音频和 IndexTTS 历史字段。
- IndexTTS 生成的文件名可能只在 IndexTTS 的 `voices/` 目录中有效，VoxCPM2 不把这类文件名当作参考音频发送；如果同一记录仍有 `sampleAudioUrl` 数据 URL，则优先使用可被 VoxCPM2 接受的样本，否则按无参考音频的声音设计模式合成。
- 仍支持 VoxCPM2 原有的 `data:audio/...` 参考音频和宿主机绝对路径。远程 URL、裸文件名和无法确认格式的字符串不进入桥接请求。
- IndexTTS 专用配置保留在 provider 注册表中，但必须通过显式 provider override 才能读取；默认解析永远读取 `MODEL_CATEGORY_PROVIDERS.audio` 的 VoxCPM2 槽位。

## 不在本次范围

- 不删除 IndexTTS 代码、历史数据或外部整合包。
- 不迁移或重编码已有音频资产。
- 不改变文本、图片模型槽位、数据库 schema 或端口约定。
- 不通过 Prisma reset、`--accept-data-loss` 或删除存量文件来修复音频链路。

## 验证标准

1. 服务端构建和音频契约测试确认默认 provider、VoxCPM2 请求路径、鉴权、metadata 以及错误传播正确。
2. 启动器测试确认默认使用 18761，并只把正式 VoxCPM2 `/health` + `/v1/models` 响应判定为就绪。
3. 旁白/对白路由测试确认旁白保持 `narration`、角色保持 `dialogue`，且 IndexTTS 文件名不会作为 VoxCPM2 参考音频发送。
4. 客户端契约测试确认旁白设置页不再挂载 IndexTTS 目录控件，仍可保存描述和生成试听。
5. 构建后通过本机 18761 健康检查和设置页/分镜配音入口进行真实链路回归；9005 不作为本次链路的前置依赖。
