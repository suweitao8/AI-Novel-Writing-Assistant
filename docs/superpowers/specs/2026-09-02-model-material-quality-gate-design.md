# Cine57 模型材质质量门禁设计

## 背景

模型导入链路目前可以在源材质没有任何可用贴图或颜色参数时继续生成 GLB。FBX2glTF 会把这个状态转换成可加载的内嵌占位纹理，PlayCanvas 因而能够渲染模型，但用户看到的是整块亮黄色或黄色局部，而不是资产本身的外观。

本次排查确认 `SM_Bathtub01.glb` 的材质 `MI_Bathtub01` 使用了内嵌的 1×1 RGBA `(255,255,0,127)` 图片；对应的 Cine57 manifest 和材质导出记录都没有任何纹理映射。当前目录材质审计只检查 `modelLibrary.ts` 中已经声明的回填路径，未声明材质时没有可审计内容，因此该资产错误地通过了质量门禁。

## 决策

1. **材质绑定完整性作为发布硬门禁。** GLB 中使用 `baseColorTexture` 的材质必须在目录中有同名材质回填。材质名按现有规范化规则比较；缺少回填时，模型不允许进入可用目录。
2. **识别内嵌退化纹理。** 质量检查读取 GLB 内嵌图片的尺寸。1×1 的内嵌 base-color 图视为导出占位纹理；如果没有目录回填，错误信息必须明确指出占位纹理和处理方向。规则不依赖某个颜色值，因此也能拦截未来的其它占位色。
3. **坏资产进入可恢复隔离清单。** 本次确认无法直接使用的 10 个模型从 `newAssets` 和前端发布目录移除，并记录到 `quarantinedAssets`，保留现有 GLB 文件，不删除源文件。策展器和质量门禁允许且只允许这些精确文件作为隔离文件，任何其它目录孤儿仍然失败。
4. **修复可确定的局部绑定缺口。** `SM_Boat_Wooden_Canoe_with_Paddle.glb` 的 `M_dark_wooden_planks_3` 是现有木质材质的未绑定重复槽位，使用同一套灰色材质回填；它不进入隔离清单。
5. **视觉审核必须建立在材质门禁之上。** 视觉审核记录仍负责名称、分类、mesh 和真实预览证据；它不能单独证明材质有效。后续新增候选必须先通过 GLB 材质绑定门禁，再进入截图审核。

## 隔离清单

以下资产的源 manifest 均记录 `textures: {}`，当前 GLB 也没有目录回填，暂不发布：

| ID | 文件 | 名称 |
| --- | --- | --- |
| `soviet-aircon-01` | `SM_AirConditioner01.glb` | 苏式空调外机 |
| `soviet-antenna-01` | `SM_Antenna01.glb` | 电视天线 |
| `soviet-ashtray-01a` | `SM_Ashtray01A.glb` | 铁皮烟灰缸 |
| `soviet-balcony-door-01` | `SM_BalconyDoorWindow01.glb` | 阳台门窗 |
| `soviet-basketball-01` | `SM_Basketball.glb` | 篮球 |
| `soviet-bathtub-01` | `SM_Bathtub01.glb` | 旧浴缸 |
| `soviet-book-01` | `SM_Book01.glb` | 旧书 |
| `soviet-vodka-01a` | `SM_BottleOfVodka01.glb` | 伏特加瓶 A |
| `soviet-vodka-01b` | `SM_BottleOfVodka02.glb` | 伏特加瓶 B |
| `soviet-plastic-canister-01` | `SM_CanisterPlastic.glb` | 塑料罐 |

隔离数据必须以唯一 ID 和文件名绑定，不能用模糊的文件名前缀或运行时搜索来隐藏资产。恢复某个资产时，先补齐真实材质回填，再从隔离清单移回显式候选，最后重新生成目录并通过全部门禁。

## 数据流

```text
Cine57 manifest / material overrides
              │
              ├─ textures 为空或材质参数不完整
              ▼
       FBX → GLB（可能带 1×1 内嵌占位图）
              │
              ├─ inspectGlb：读取 baseColorTexture 与内嵌图片尺寸
              ├─ texture contract：材质名必须有目录回填
              └─ quarantine policy：坏资产只能留在隔离清单
              ▼
      modelLibrary.ts → 视觉审核 → 模型详情页
```

## 回滚与安全

- 本次隔离不删除 `client/public/models/cine57` 中原有 GLB；文件仍由 Git 保留，可通过策略恢复。
- 前端目录不再引用隔离模型，模型详情页无法从模型库入口打开它们。
- 如果质量门禁发现未列入隔离清单的孤儿 GLB，必须修正来源或显式审核，不能把它加入宽泛的忽略规则。

## 相关模块

- `scripts/models/modelLibraryQuality.mjs`：GLB 结构、材质和目录一致性检查。
- `scripts/models/modelLibraryTextureAudit.mjs`：目录材质回填与 GLB 材质绑定契约。
- `scripts/models/modelLibraryPolicy.mjs`：发布候选、隔离清单和材质覆盖的单一策略入口。
- `scripts/models/curate-cine57-library.mjs`：按策略重新生成目录，并允许精确隔离文件存在。
- `client/src/config/modelLibrary.ts`：生成后的可用目录，不手工扩展。
- `docs/wiki/product/model-library.md`：模型库长期准入规则。
