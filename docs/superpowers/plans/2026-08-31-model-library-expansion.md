# 模型库前景资产扩容与分类实施计划

> **执行规则：** 每完成一个步骤都先运行该步骤的聚焦检查；资产删除前必须完成并校验本地备份。所有开发在 `codex/model-library-expansion` worktree 内进行。

## Step 1: 先写失败测试

**Files:**

- Modify: `scripts/models/model-library-quality.test.mjs`
- Modify: `scripts/models/modelLibraryQuality.mjs`

- 增加对精选白名单、细分类别和纸箱族最多两个条目的断言。
- 将旧的 36 条目断言改成新的策略约束断言，但先让测试因当前目录仍为旧目录而失败。

Run: `pnpm test:model-library`

Expected: 测试明确报告当前目录未覆盖新的细分类别/精选清单或仍有超额纸箱变体，证明测试入口确实覆盖本次需求。

## Step 2: 固化模型选择策略和导出输入

**Files:**

- Create: `scripts/models/model-library-selection.json`
- Create: `scripts/models/modelLibraryPolicy.mjs`
- Modify: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/curate-cine57-library.mjs`
- Modify: `docs/wiki/product/model-library.md`

- 记录保留的旧模型、删除的近似纸箱、批次 3 新模型以及需要从 Cine57 单独导出的自然资产。
- 维护分类顺序、分类合法性、白名单 ID 和纸箱族上限的单一策略入口。
- 让策展命令按允许清单清理目录，而不是依赖固定的 36 条目数量。
- 保留历史移出 ID，并把新淘汰/替换的纸箱 ID纳入可解释的移出集合。

Run: `pnpm test:model-library`

Expected: 策略单测通过；实际目录门禁仍可能因新资产尚未转换而失败，但失败原因必须是缺失目标资产而不是策略解析错误。

## Step 3: 备份、导出和转换候选资产

**Files:**

- Add generated GLB/texture files under `client/public/models/cine57/`
- Regenerate: `client/src/config/modelLibrary.ts`

- 将当前模型目录和目录文件复制到时间戳备份目录，检查 GLB 数量、纹理数量和总字节数。
- 从 `Cine57-exported3/_manifest_batch3.jsonl` 只转换精选完整静态网格。
- 从 Cine57 中补导独立树木、灌木、草花/花盆候选，生成材质 manifest 后再转换。
- 执行碰撞体、LOD 和材质清洗；只保留通过尺寸和完整性检查的候选。
- 运行生成器和策展命令，清理五个纸箱变体中的多余文件及其孤儿贴图。

Run: `node scripts/models/curate-cine57-library.mjs`

Expected: 目录生成新的约 70–80 个前景条目，纸箱族最多两个，床/桌/椅仍存在，自然和摆件细分类别均有实际条目。

## Step 4: 运行质量门禁和客户端验证

**Files:**

- No additional source files expected unless a focused failure requires a fix.

Run:

- `pnpm test:model-library`
- `pnpm check:model-library`
- `pnpm --filter @ai-novel/client typecheck`
- `pnpm --filter @ai-novel/client build`
- `git diff --check`

- 用 Codex 内置浏览器访问 `http://127.0.0.1:5174/models`。
- 检查全部分类页签、纸箱代表、家具、玩具/装饰品、石头、灌木、树木、草、花和盆栽；至少打开代表模型的完整预览。
- 确认网络请求成功、缩略图和 GLB 可加载、无 console error，并保存关键截图证据。

Expected: 所有聚焦检查通过，浏览器 smoke 覆盖扩容后的分类和关键资产。

## Step 5: 提交、集成和收尾

- 根据用户可见变化更新 `docs/releases/release-notes.md` 和 README 最新更新；稳定规则写入模型库 wiki。
- 自检 diff 只包含本次模型库扩容、分类、质量门禁和文档。
- 使用 `git commit -s` 提交 worktree 分支。
- 在干净主工作区运行 `pnpm workflow:integrate codex/model-library-expansion --push --verify "pnpm check:model-library && pnpm test:model-library"`。
- 核对 `main` 与 `origin/main` SHA 相同，确认本次 worktree 已合并后再删除并运行 `git worktree prune`。
