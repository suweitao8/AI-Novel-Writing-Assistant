# HDRI 方向光与半球直径范围 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HDRI 中最亮区域可靠地驱动 PlayCanvas 方向光，并把场景 3D 编辑器的半球直径明确限制为 5–30 米。

**Architecture:** 保留现有 EnvAtlas 和可见 HDRI 投影，只修正方向光分析适配层：普通图片继续通过 canvas 读取，PlayCanvas `.hdr` 的 RGBE 字节纹理直接解码后分析，二者共用同一套等距柱状坐标和亮区权重。场景数据仍以 `radiusMeters` 作为内部真实半径保存，页面把它显示为 `半球直径 = radiusMeters × 2`，因此不会破坏既有 API 和旧快照兼容。

**Tech Stack:** React 19、Vite、TypeScript、PlayCanvas 2.21、Node test、共享 TypeScript 类型与 Zod 合同。

---

### Task 1: 锁定 RGBE HDRI 亮区分析回归

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.test.mjs`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.ts`

- [ ] **Step 1: 写失败测试**

  增加一个模拟 PlayCanvas RGBE 纹理源的测试：`getSource()` 返回 4 通道 `Uint8Array`，纹理尺寸为 32×16、`type: "rgbe"`，在图像右上方放置高亮 RGBE 像素；断言 `estimateHdriLightFromTexture` 不使用后备值、方向指向世界 `+X` 且高度为正。增加一个普通图片源测试所需的 source 类型契约，确保现有 LDR 亮区行为不回退。

- [ ] **Step 2: 运行测试确认它因 RGBE 未支持而失败**

  Run: `node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.test.mjs`

  Expected: 新增 RGBE 测试失败，现有普通像素测试保持通过；失败原因应体现当前二进制源被当作 canvas 图片处理后回退。

### Task 2: 支持 HDR/RGBE 源并保持亮点与可见投影同向

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentKeyLight.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: 解码 PlayCanvas RGBE 字节源**

  将纹理源读取接口改为接受 `unknown` source、纹理 `width/height/type` 元数据；当 `type === "rgbe"` 且源是 4 字节像素缓冲时，按 Radiance RGBE 公式 `channel × 2^(exponent - 128) / 256` 解码。使用色调压缩后的 RGB 作为颜色与亮区分析输入，避免高动态范围值直接把三个颜色通道都裁成白色；普通 `HTMLImageElement`/canvas source 保持原路径。

- [ ] **Step 2: 让亮区选择优先于整片天空平均值**

  对 RGBE 源基于上半部采样峰值做相对亮度权重，保留球面固体角权重和经度首尾环绕；方向仍使用 PlayCanvas `sampleEquirect` 的逆映射（`u = atan(x,z)/(2π)+0.5`、`v = 0.5 - asin(y)/π`）。普通 LDR 源沿用现有绝对阈值。保留有限强度和无有效亮区的稳定 fallback。

- [ ] **Step 3: 明确方向光轴与阴影语义**

  在 key-light 模块中补充注释/可测试契约：实体世界 Y 轴指向 HDRI 亮部，PlayCanvas dispatch 会把它转换为负的 shader light direction，Lambert 与阴影因此从亮部方向入射、阴影投向相反方向；不再把实体位置当作方向依据。

- [ ] **Step 4: 增加坐标一致性和静态合同断言**

  让投影测试验证由亮区像素反算出的方向经过 `projectEquirectangularDirection` 后回到相同经纬度；更新静态合同，锁定 `.hdr` RGBE 分支、方向光应用链路和现有 EnvAtlas/投影链路同时存在。

- [ ] **Step 5: 运行方向光聚焦测试**

  Run: `node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs client/tests/dramaBlocking3dStaticHdri.contract.test.js`

  Expected: 所有亮区、RGBE、坐标往返和静态链路测试通过。

### Task 3: 将场景 3D 编辑器的用户语义改为半球直径 5–30

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/tests/storyScene3dStateContracts.test.js`
- Modify: `shared/types/comicDrama.ts` only if a named current diameter-limit constant is needed by the page

- [ ] **Step 1: 写失败页面合同**

  更新页面合同，要求控件显示 `半球直径`、`min="5" max="30"`，并断言变更事件把直径除以二后继续写入 `radiusMeters`；同时保留投射中心高度按半径比例派生。

- [ ] **Step 2: 运行页面合同确认旧文案/范围失败**

  Run: `node --test client/tests/storyScene3dStateContracts.test.js`

  Expected: 旧的“圆半径 2.5–15”断言与新语义断言产生预期差异。

- [ ] **Step 3: 实现受控直径控件**

  在页面使用共享半径边界换算出的 5–30 直径边界，输出 `radiusMeters * 2`；range 的 value 使用直径，onChange 将输入值 `/ 2` 后传给现有 `updateEnvironmentSetting("radiusMeters", ...)`。内部环境归一化、服务端 schema 和数据库字段保持 `radiusMeters`，旧 `domeRadius` 兼容不变。

- [ ] **Step 4: 运行页面合同与客户端类型检查**

  Run: `node --test client/tests/storyScene3dStateContracts.test.js` and `pnpm --filter @ai-novel/client typecheck`

  Expected: 页面合同和客户端类型检查通过，投影/保存路径没有新增类型错误。

### Task 4: 自测、文档与交付

**Files:**
- Modify: `docs/releases/release-notes.md` for the user-visible diameter wording and HDRI lighting behavior
- Modify: `README.md` only if the release updater requires the latest summary there
- Modify: `docs/wiki/debugging/` or `docs/wiki/architecture/` only if the RGBE fallback diagnosis is durable wiki knowledge

- [ ] **Step 1: 运行完整的相关客户端验证**

  Run: `pnpm --filter @ai-novel/client build` plus the focused tests from Tasks 2–3.

- [ ] **Step 2: 浏览器自测本地场景/模型 3D 预览**

  使用内置浏览器访问本地 `5174` 页面，加载包含 `.hdr` 资源的预览，确认页面能进入、角色/代理模型有来自 HDRI 亮部的方向性明暗和反向阴影，拖动半球直径时 5 米与 30 米都可到达且环境按半径重建；记录控制台与网络无新增错误，并保存关键截图。

- [ ] **Step 3: 自审 diff 并提交**

  检查没有改动数据库或并行 worktree，确认 release notes/wiki 边界，执行 `git commit -s`。

- [ ] **Step 4: 集成、推送、清理并复核状态**

  从干净主工作区运行 `pnpm workflow:integrate codex/hdri-direction-fix --push --verify "pnpm --filter @ai-novel/client typecheck"`，随后检查 `main` 与 `origin/main` SHA 一致、主工作区干净，删除本次已合并 worktree/本地分支并保留其他 worktree。
