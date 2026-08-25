# 漫剧 3D 场景 HDRI 光照与比例参照实施计划

> **实施约束：** 每个实现切片先补充会失败的聚焦测试，再实现并验证；所有改动留在 `codex/drama-3d-hdri-reference` 隔离工作树。

## 1. 运行时契约测试

**文件：**

- 修改：`client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- 修改：`client/tests/dramaBlocking3dPage.contract.test.js`
- 删除或改造：`client/tests/dramaBlocking3dEnvironmentMath.test.js`（仅在确认旧的主光估算不再被引用后处理）

**步骤：**

1. 将“从 HDRI 亮部估算方向光”的断言改为真实环境光照 atlas 的断言，并明确禁止方向光、补光和旧的像素采样主光路径。
2. 增加绿色选中环、位置移动开关、场景页关闭移动、固定提示和 1.8 米校准的契约断言。
3. 先运行定向测试，确认它们因当前实现缺少目标行为而失败。

## 2. HDRI 环境光照实现

**文件：**

- 修改：`client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- 删除：`client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentMath.ts`（无剩余引用时）

**步骤：**

1. 删除方向光、补光和 `estimateHdriLightDirection` 依赖；初始化中性 `scene.ambientLight` 作为无 HDRI 兜底。
2. 在环境纹理加载后设置等距投影，生成 lighting source 和 environment atlas，并赋给 `app.scene.envAtlas`；切换环境、加载失败和销毁时释放 atlas/source 并恢复兜底环境光。
3. 保留现有上半球、下半球和自发光材质显示链路，使 HDRI 同时承担背景显示和角色环境照明。
4. 将选中环改为绿色，并确保它在无直接灯光时仍有足够可见性。

## 3. 场景参照角色锁定与比例校准

**文件：**

- 修改：`client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- 修改：`client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`

**步骤：**

1. 在 viewer API 增加只控制角色位置的开关；指针命中仍负责选择，但关闭后不进入角色拖动模式，位置调整接口也返回失败；相机交互保持不变。
2. 根据 UAL2 代理模型的原始高度校准新角色根节点到 1.8 米，并让场景页参照角色使用该基准。
3. 场景页创建参照角色后关闭角色位置移动，更新用户提示为参照角色固定、相机仍可操作。

## 4. 稳定知识与用户可见记录

**文件：**

- 修改：`docs/wiki/workflows/drama-blocking-3d.md`
- 修改：`docs/releases/release-notes.md`
- 修改：`README.md`

**步骤：**

1. 在 3D 工作流 Wiki 记录“HDRI envAtlas 是角色环境光唯一来源”和“场景参照角色只锁位置”的运行时边界。
2. 按 Release Notes 工作流补充用户可见更新，并保持 README 只保留最新日期块的摘要。

## 5. 验证与交付

**步骤：**

1. 运行契约测试、客户端类型检查和必要的客户端构建。
2. 使用固定端口浏览器重新打开场景 3D 编辑页，确认 HDRI 加载、绿色选中态、参照角色固定提示、1.8 米标识以及无控制台错误。
3. 检查 worktree 只包含本目标的改动，使用 `git commit -s` 提交。
4. 在主工作区重新执行集成前检查，使用项目集成脚本合并并显式推送 `origin/main`，确认远端与本地一致后清理已合并 worktree。
