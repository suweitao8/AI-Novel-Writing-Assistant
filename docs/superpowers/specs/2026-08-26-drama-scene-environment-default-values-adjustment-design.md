# 场景资产 3D 环境默认参数调整设计

## Background

场景资产的 3D 环境已经按场景默认状态类型解析 `interior`（室内）、`exterior`（室外）和 `nature`（自然）三类默认值，但当前数值仍是室内 `2 / 10`、室外 `2 / 15`、自然 `2 / 20`。这使室内投射中心偏高、室外半球范围偏大，也没有体现自然场景需要更大覆盖范围的区别。

`NovelScene.scene3dEnvironmentJson` 是场景级唯一环境参数源，类型优先来自场景的默认状态，旧数据才回退到场景顶层类型。环境值可以由用户在 3D 编辑器中显式调整，因此本次只调整未自定义状态的默认值，不覆盖用户已经校准过的环境。

## Decision

### 1. 采用新的类型默认值

| 场景类型 | 投射中心高度（米） | 半球直径（米） |
| --- | ---: | ---: |
| 室内 `interior` | 1 | 8 |
| 室外 `exterior` | 1.7 | 10 |
| 自然 `nature` | 1 | 20 |

水平旋转继续固定为 `0`，环境亮度继续固定为 `1`，全景地面分界继续固定为 `v=0.5`。参数范围仍为投射中心高度 `1–10`、半球直径 `5–30`，因此三组默认值都能直接进入现有运行时合同。

类型缺失或非法时继续按室外处理，通用无类型客户端回退也使用室外默认 `1.7 / 10`。

### 2. 统一读取链路

服务端 `StoryScene3dEnvironment` 继续作为默认值唯一来源：场景列表、场景 3D 编辑器、空间标记分析和分镜阻挡都使用同一个解析器。客户端 viewer 的无数据回退同步为室外 `1.7 / 10`，避免页面尚未拿到场景响应时短暂显示另一套尺寸。

### 3. 历史数据兼容

- 环境 JSON 明确写入 `customized: true` 的记录继续原样归一化，不受类型默认变化影响。
- `customized: false`、空值或损坏 JSON 继续按当前场景类型取得新默认值。
- 没有 `customized` 标记且数值匹配历史系统默认快照 `2 / 15`、旧类型默认 `2 / 10` 或 `2 / 20` 的记录，视为未自定义并迁移到新类型默认值。
- 没有 `customized` 标记且数值匹配新三类默认值的记录，也按未自定义处理，使场景类型变化时能够继续使用正确的类型默认值。
- 不新增数据库迁移；下一次用户显式保存时由现有序列化链写入明确的自定义标记。

历史数据无法区分“用户恰好保存了某个旧默认值”和“系统写入旧默认值”时，沿用既有兼容策略优先迁移；用户显式保存并带有 `customized: true` 的记录不受影响。

## Data flow

```text
场景默认状态 sceneType
        │
        ├─ StoryScene3dEnvironment：类型解析 + 新默认映射 + 历史默认识别
        │        ├─ 设定中心场景 DTO
        │        ├─ 场景空间标记分析
        │        └─ 分镜阻挡上下文
        │
        └─ 客户端 DramaScene3DPage / blocking3dViewerApp
                 └─ 无服务端环境时按室外 1.7 / 10 回退
```

## Non-goals

- 不锁死高度和半球直径滑块；用户仍可在 3D 编辑器中校准并保存自定义值。
- 不改变场景类型的来源优先级、空间标记投影、HDRI 几何或分镜布局合同。
- 不通过关键词或额外 AI 调用推断缺失的场景类型。
- 不批量改写数据库中的自定义环境记录。

## Verification

- 服务端环境单元测试逐项断言三类新默认值、室外兜底、历史默认迁移和自定义值保留。
- 客户端静态契约测试断言 viewer 的通用默认值为 `1.7 / 10`。
- 服务端和客户端类型检查、相关场景环境与传播契约测试、客户端构建通过。
- 集成后确认 `main` 与 `origin/main` 同步，且临时 worktree 清理完成。

## Related modules

- `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`
- `server/tests/storyScene3dEnvironment.test.mjs`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- `client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- `docs/wiki/workflows/drama-blocking-3d.md`
