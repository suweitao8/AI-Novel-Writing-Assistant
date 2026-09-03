# 分镜 3D 动作与朝向落地实施计划

## 目标

修复自动构图结果在服务端到 3D 编辑器之间的语义丢失：有向关系必须产生可验证的角色朝向，缺失躺姿动画时不能把角色保存成站立；首镜头“叶晨躺下、血角兽伏低并面向叶晨”作为回归样例。

## 实施步骤

### 1. 先写失败测试

- 在服务端自动构图测试中加入朝向断言：`on_top_of`、`facing`、`attacking`、`holding`、`following` 的 subject yaw 等于指向 object 的 XZ 方位角；反向上下关系归一化后仍使用归一化后的主动方；位置、身高比例和相机结果不因朝向约束被改变。
- 在客户端姿势测试中加入 UAL2 实际片段集合：`lying`/`prone` 没有专用片段时返回显式贴地展示方案、业务 pose 不变；缺少其他姿势时仍明确抛错。
- 在 viewer core 合同测试中锁定：加载和选择姿势不允许有 `appliedPose = standing` 式静默降级，导出姿势来自请求语义。

先运行这些定向测试，确认新断言在现状下失败：服务端当前不改 yaw，播放器当前会将 lying/prone 改成 standing。

### 2. 实现结构化关系的确定性朝向

- 在共享 blocking 舞台几何模块增加 XZ 目标方位角计算，统一角度归一化到 `[-180, 180]`。
- 在 `DramaShotBlockingSketchService` 的关系约束阶段调用该几何函数：
  - `facing`、`attacking`、`holding`、`following` 让 subject 面向 object；
  - `on_top_of` / `under` 在上下端点归一化后让上方主动方朝向承载者；
  - 同一 subject 的多条关系按确定性规则合并，显式有向关系覆盖仅由上下关系带来的朝向，避免处理顺序改变结果。
- 更新 PromptAsset 的关系说明和版本，使模型明确为有方向的视线/动作输出关系；不新增原始中文关键词判断。

### 3. 实现非静默姿势展示

- 在 blocking 姿势模块集中声明每个业务姿势的渲染方式：真实 UAL2 片段优先；`lying`/`prone` 缺少稳定专用片段时使用统一文件中可见的 `Slide_Loop` 低姿态片段作为贴地代理，返回的业务 pose 仍为请求值；其它缺失片段直接报资源能力错误。
- 修改 viewer core 的姿势入口统一使用该展示解析，加载、手动选择和新建角色复用同一逻辑；重置模型局部姿态时保留已有 UAL2 基准旋转。
- 删除静默 `appliedPose` 站立降级路径，并确保 `exportLayout()` 导出语义 pose；必要时在错误信息中指出具体姿势和资源能力。

### 4. 文档与用户可见说明

- 在 `docs/wiki/workflows/drama-blocking-3d.md` 补充“关系决定朝向”和“代理动画缺失时显式贴地展示/禁止站立降级”的稳定规则、失败模式及诊断路径。
- 在 `docs/releases/release-notes.md` 追加一条用户可见的 3D 自动构图修复说明；README 只在当前项目约定要求时刷新最新更新。

### 5. 验证与交付

- 构建 shared、server、client；运行服务端自动构图测试和客户端 blocking 3D 测试。
- 启动工作树自己的 3141/5250 服务（不触碰主工作区 3100/5174），用内置浏览器打开首镜头 3D 草图，执行一次“重新构图”，确认姿势、朝向、取景和控制台错误状态。
- 对照需求检查 diff：无关键词分支、无旧数据自动写入、关系方向可复现、姿势语义不被资源缺失吞掉。
- 通过 Self-Test 后使用签名提交，调用项目集成入口合并到 `main`、显式推送 `origin/main`，最后核对状态、远程 SHA 和清理本次工作树；保留其他并行工作树。

## 预期修改文件

- `shared/utils/blockingStage.ts` 及其测试
- `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- `server/tests/dramaShotBlockingAutoPlanService.test.js`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`
- `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts`
- 对应客户端测试、wiki 和 release notes

## 风险与控制

- UAL2 没有稳定的静态躺/趴姿片段，`Slide_Loop` 是有限的低姿态代理展示，不声称替代真实动作；业务 pose 会保留，后续替换资源时可自动优先使用真实片段。
- 历史布局没有 relations 字段，不能可靠重建旧意图；本次不静默批量修改数据库，用户主动重新构图后才获得新结果。
- 共享主工作区端口和并行工作树不改变；工作树服务只使用脚本分配的隔离端口。
