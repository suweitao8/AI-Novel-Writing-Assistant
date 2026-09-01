# 模型库现代写实资产与可恢复隐藏设计

## Background

模型库的目标是为分镜提供稳定、统一的现代场景资产。当前仓库已经有一批来自 Cine57 的静态模型和显式筛选规则，但原始导出清单还包含技术部件、旧式或装饰性变体，不能把不同包体的模型无条件倒入产品目录。与此同时，创作者需要在发现模型质量不合格时把它从模型库中移除，但误操作不能破坏模型文件、已有分镜或后续恢复能力。

## Goals

1. 将可进入产品模型库的资产约束为 Cine57 来源、现代语境、写实方向，并继续经过显式选择、清洗、缩略图审核和质量门禁。
2. 支持按现有 Cine57 清单批量扩充，但不把原始 FBX 清单当作可直接发布目录。
3. 在模型详情页提供删除入口和二次确认；确认后模型从目录隐藏，模型文件、材质、缩略图以及已有引用全部保留。
4. 让目录筛选、分类计数、分页和详情页跳转都遵守隐藏状态；服务不可用时不误展示可能已经隐藏的资产。

## Non-goals

- 不在本次工作中物理删除 GLB、纹理或 Unreal 导出文件。
- 不把角色动画包中的角色模型混入道具/场景模型库。
- 不用浏览器 localStorage 作为模型可见性的事实来源。
- 不引入一个“把所有 FBX 自动发布”的无审核导入路径。

## Decisions

### 1. 统一的资产准入契约

模型库的发布契约固定为：

- source：`Cine57`
- art direction：`realistic`
- era：`modern`
- visual review：required and approved

契约作为模型库选择清单和质量检查的显式输入。现有的分类顺序、现代资产数量下限、组件/技术变体排除规则、尺寸与材质检查继续有效。静态目录中的每个发布条目必须来自 Cine57 且通过对应的视觉审核；UAL2 等动画资源只保留在其自身用途内，不得作为静态模型目录条目。

批量扩充采用以下顺序：

```text
manifest candidates
  -> explicit mesh selection
  -> UE/FBX2glTF conversion
  -> GLB cleanup and material/texture validation
  -> catalog regeneration
  -> thumbnail visual review
  -> model-library quality gate
  -> publish
```

没有完成转换、清洗和视觉审核的资产只属于候选清单，不进入 `MODEL_LIBRARY`。

### 2. 隐藏而不是物理删除

用户点击删除后，系统只记录“该模型 ID 在当前模型库中隐藏”。每个隐藏 ID 单独存为一条 `AppSetting`，键使用固定前缀和编码后的模型 ID。这样可以避免多个请求同时更新一份 JSON 列表时互相覆盖，也不需要数据库迁移。

服务端提供三个能力：

- 读取当前隐藏 ID 集合；
- 隐藏一个模型 ID，重复执行保持幂等；
- 恢复一个模型 ID，重复执行保持幂等。

写入前只接受静态目录允许的安全 ID 格式，不接受文件路径。该能力不触碰磁盘上的模型资产，也不修改分镜中的引用。

### 3. 前端目录和详情页行为

- 模型库进入时先读取隐藏状态；读取失败时不渲染完整目录，并提供重试，避免把已隐藏资产短暂展示出来。
- 隐藏 ID 在搜索、分类、分类计数和分页之前排除，保证页码和数量一致。
- 详情页使用现有设计系统的对话框组件完成二次确认，支持取消、Esc 和遮罩关闭；提交期间禁用重复提交。
- 确认文案明确说明“从模型库中隐藏”，并说明模型文件和已有分镜引用会保留。
- 成功后回到模型库并刷新可见目录；失败时保留详情页并显示错误反馈。

## Error handling and recovery

- 目录可见性读取失败：fail closed，显示重试状态，不把静态全量目录当作最终结果。
- 隐藏请求失败：不跳转、不改变本地最终状态，保留可再次操作的详情页。
- 重复隐藏/恢复：服务端按幂等操作处理。
- 误隐藏：通过服务端恢复能力恢复目录可见性；恢复不会重新生成或复制资产。
- 任何模型文件缺失、材质断链、缩略图审核缺失或非现代写实条目都在质量门禁中失败，而不是由 UI 静默兜底。

## Acceptance criteria

- 质量检查能拒绝非 Cine57、非写实或非现代契约的静态目录条目。
- 当前已发布模型通过新的契约检查，不引入未经审核的新模型。
- 模型库能正确加载隐藏状态，隐藏模型不出现在分类、搜索、计数和分页结果中。
- 详情页删除按钮可打开二次确认；取消不会隐藏模型，确认后模型消失且返回目录。
- 隐藏后模型文件和已有引用仍存在，恢复接口可以让模型重新出现在目录中。
- 相关服务端测试、客户端测试、类型检查和内置浏览器主路径冒烟测试全部通过。

## Related modules

- `client/src/config/modelLibrary.ts`
- `client/src/config/modelLibraryFilters.ts`
- `client/src/pages/models/ModelLibraryPage.tsx`
- `client/src/pages/models/ModelEditorPage.tsx`
- `server/src/modules/model-library/`
- `server/src/prisma/schema.prisma` (`AppSetting`)
- `scripts/models/model-library-selection.json`
- `scripts/models/modelLibraryPolicy.mjs`
- `scripts/models/modelLibraryQuality.mjs`
- `scripts/models/modelLibraryVisualReview.mjs`
- `docs/wiki/product/model-library.md`
