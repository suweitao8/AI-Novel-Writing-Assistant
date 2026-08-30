# 动画库统一目录与 UAL2 重定向基准修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 UAL2 内置动画与 Cine57 导入动画统一展示在动画库中，并从离线重定向基准修复待机/行走手臂错位。

**Architecture:** `/anims/cine57/UAL2_UE_Anims.glb` 是唯一运行时资产，目录条目覆盖其中全部 46 段动画。`retarget_ual2.py` 从 UAL2 的 `Idle_No_Loop` 固定采样帧提取目标站立基准，将源动画相对源绑定姿态的世界旋转增量应用到该基准；PlayCanvas 只播放已修正的结果。缩略图工作室一次加载 `ContainerResource`，逐条实例化并销毁角色。

**Tech Stack:** Python 3、glTF 2.0 GLB、Node.js `node:test`、TypeScript/React、PlayCanvas、Vite、Codex 内置浏览器。

---

## 文件边界

- `scripts/animation/retarget_ual2.py`：离线源骨架到 UAL2 骨架的姿态重定向、GLB 写入和验证。
- `scripts/animation/README.md`：重定向基准与导出前提的操作规则。
- `client/src/config/animationLibrary.ts`：46 段静态目录、来源、分类、时长和统一 GLB 地址。
- `client/src/config/animationLibrary.test.mjs`：目录覆盖 GLB 动画集合、来源和时长契约。
- `client/src/config/animationLibraryContent.test.mjs`：发布 GLB 的动作内容、姿态和结构门禁。
- `client/src/pages/animations/animationThumbnailStudio.ts`：蓝色角色缩略图队列、一次加载的共享资源和缓存版本。
- `client/src/pages/animations/animationPreviewApp.test.mjs`：预览/缩略图源码契约，更新资源复用和缓存版本断言。
- `client/public/anims/cine57/UAL2_UE_Anims.glb`：重新生成的发布资源，只替换 3 个 Cine57 动画，保留 UAL2 原有 43 段动作和网格数据。
- `docs/wiki/product/model-library.md`：长期维护规则，不写变更清单。
- `docs/releases/release-notes.md`、`README.md`：用户可见的动画库更新摘要。

### Task 1: 先写会失败的目录和姿态回归

**Files:**

- Modify: `client/src/config/animationLibrary.test.mjs`
- Modify: `client/src/config/animationLibraryContent.test.mjs`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`

- [ ] **Step 1: 增加目录覆盖断言**

在 `animationLibrary.test.mjs` 的真实 GLB 目录测试中，保留现有字段/时长断言，并加入以下断言逻辑：

```js
const actualClipNames = new Set(durationsByFile.get(ANIMATION_LIBRARY[0].fileUrl).keys());
const catalogClipNames = new Set(ANIMATION_LIBRARY.map((entry) => entry.clipName));
assert.equal(ANIMATION_LIBRARY.length, actualClipNames.size);
assert.deepEqual(catalogClipNames, actualClipNames);
assert.equal(ANIMATION_LIBRARY.filter((entry) => entry.source === "UAL2").length, 43);
assert.equal(ANIMATION_LIBRARY.filter((entry) => entry.source === "Cine57").length, 3);
```

将单一来源断言从 `entry.source === "Cine57"` 改为 `entry.source === "UAL2" || entry.source === "Cine57"`，并把现有缓存/来源源码断言的旧三段保留。

- [ ] **Step 2: 增加能识别手臂基准错误的内容断言**

在 `animationLibraryContent.test.mjs` 的 `导入动画保留动作姿态` 测试中，在现有待机手部和坐姿骨盆断言之后加入行走姿态采样。使用 GLB 内真实动画时长，不硬编码采样器数量：

```js
const walkAnimation = glb.json.animations.find(
  ({ name }) => name === "A_INP_WalkFwd_Loop",
);
const walk = composePose(
  glb,
  walkAnimation.name,
  animationDuration(glb, walkAnimation) * 0.4,
);
const handDelta = (pose, handName, shoulderName) => {
  const hand = pose.worldPosition.get(nodes.get(handName));
  const shoulder = pose.worldPosition.get(nodes.get(shoulderName));
  return hand[1] - shoulder[1];
};
assert.ok(
  idleHand[1] - idleShoulder[1] < -0.4,
  "待机手部仍接近 T-Pose，不能只用低于肩部 0.1m 判定正确",
);
assert.ok(
  (handDelta(walk, "hand_l", "clavicle_l") +
    handDelta(walk, "hand_r", "clavicle_r")) / 2 < -0.32,
  "行走双手平均高度仍接近错误的水平基准",
);
```

这两个阈值来自当前 UAL2 `Idle_No_Loop` 的固定 40% 姿势（约 `-0.50m`）与当前错误 Cine57 输出（待机约 `-0.27m`、行走平均约 `-0.25m`）的可分离区间。

- [ ] **Step 3: 把已有过时缓存断言改成下一资源版本**

在 `animationPreviewApp.test.mjs` 中把两个 `animation-library:thumbnails:v4` 断言改成 `animation-library:thumbnails:v6`；同时把缩略图资源生命周期断言改成检查共享 asset 在工作室销毁时释放：

```js
assert.match(studioSource, /const asset = await loadAsset\(app, ANIMATION_LIBRARY_FILE_URL, "container"\)/);
assert.match(studioSource, /app\.assets\.remove\(asset\)/);
assert.doesNotMatch(studioSource, /render\(entry\)[\s\S]*?loadAsset\(app, entry\.fileUrl/);
```

- [ ] **Step 4: 运行新增测试，确认它们在旧实现上失败**

运行：

```text
node --experimental-strip-types --test client/src/config/animationLibrary.test.mjs client/src/config/animationLibraryContent.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs
```

预期：目录覆盖断言因当前只有 3 条失败；待机/行走更严格的手部断言失败；缓存版本/资源复用源码断言也失败。不得修改发布资源来绕过这一步。

### Task 2: 实现固定 UAL2 站立基准的离线重定向

**Files:**

- Modify: `scripts/animation/retarget_ual2.py`
- Modify: `scripts/animation/README.md`

- [ ] **Step 1: 提取目标基准动画并增加可采样的局部姿态函数**

在输入校验后保留现有 4 参数 CLI 兼容，同时允许第 5 个参数覆盖目标基准片段名；默认值固定为 `Idle_No_Loop`。定义常量和参数校验：

```python
TARGET_POSE_ANIMATION = "Idle_No_Loop"
TARGET_POSE_FRACTION = 0.4

if len(sys.argv) not in (5, 6):
    raise SystemExit(
        "usage: python retarget_ual2.py <source.glb> <target.glb> "
        "<output.glb> <animation-name> [target-pose-animation]"
    )

anim_path, base_path, out_path, anim_name = sys.argv[1:5]
target_pose_name = sys.argv[5] if len(sys.argv) == 6 else TARGET_POSE_ANIMATION
```

把 `sample_rot`、`sample_vec` 提前到重定向计算之前，使用线性插值/四元数 slerp，并通过 `load_tracks(bj, bbuf, target_pose_name)` 读取目标基准。目标片段不存在或没有 rotation 轨道时直接 `ValueError`，不能静默回退到 T-Pose。

- [ ] **Step 2: 构造固定目标站立基准的局部与世界姿态**

取目标基准动画最长采样时间 `base_duration` 的 `TARGET_POSE_FRACTION`，按目标拓扑顺序计算每个节点的基准局部旋转、基准局部平移和世界旋转：

```python
base_grid = [time for track in base_tracks.values() for path, (times, _) in track.items() if path == "rotation" for time in times]
base_duration = max(base_grid)
base_time = base_duration * TARGET_POSE_FRACTION

target_base_local_rot = {}
target_base_local_trans = {}
target_base_world = {}
for ui in b_order:
    rotation_track = base_tracks.get(ui, {}).get("rotation")
    translation_track = base_tracks.get(ui, {}).get("translation")
    local_rot = qnorm(sample_rot(rotation_track, base_time)) if rotation_track else rest_rot(bnodes[ui])
    local_trans = sample_vec(translation_track, base_time) if translation_track else rest_trans(bnodes[ui])
    target_base_local_rot[ui] = local_rot
    target_base_local_trans[ui] = local_trans
    parent = bparent.get(ui)
    target_base_world[ui] = local_rot if parent is None else qmul(target_base_world[parent], local_rot)
```

只保留 `skins[].joints` 的输出通道；目标基准使用 UAL2 自己的通道，因此目标骨骼长度、局部轴和手指姿态不再从源 A-Pose 猜测。

- [ ] **Step 3: 把目标绑定姿态改成目标站立基准**

在输出旋转循环中把旧的 `tgt_rest_world[ui]` 换成 `target_base_world[ui]`，并把未匹配节点的本地旋转从目标静止旋转换为 `target_base_local_rot[ui]`：

```python
desired = qmul(
    qmul(a_worldF[src][f], qconj(src_rest_world[src])),
    target_base_world[ui],
)
parent_world = bt_worldF.get(p, [None] * F)[f] if p is not None else None
local_rot = qnorm(
    desired if parent_world is None else qmul(qconj(parent_world), desired)
)
```

把目标输出平移基线从 `rest_trans(bnodes[ui])` 改为 `target_base_local_trans[ui]`。根/骨盆若有源平移轨道，继续执行源绑定姿态相对增量公式，但叠加到目标基准平移：

```python
out_trans[ui] = [
    tuple(target_base_local_trans[ui][k] + scale * (value[k] - a_rest[k]) for k in range(3))
    for value in src_trans[src]
]
```

对于没有源平移轨道但目标基准平移与绑定平移不同的 skin joint，输出固定的目标基准平移通道；这样验证器重组出来的目标角色与基准站姿一致。

- [ ] **Step 4: 让验证器比较新公式并输出可审计指标**

`expected` 由 `target_base_world` 构造，而不是 `tgt_rest_world`：

```python
expected = qmul(
    qmul(a_worldF[src][F // 2], qconj(src_rest_world[src])),
    target_base_world[ui],
)
```

在现有 `verify` 输出中增加 `target pose=<name>@<fraction>`，并打印左右手相对肩部高度；当 `worst |dot| <= 0.999`、源/目标基准缺失或四元数非单位时失败。

- [ ] **Step 5: 更新工具说明并运行离线自检**

在 `scripts/animation/README.md` 说明目标基准默认是 UAL2 `Idle_No_Loop` 的 40% 采样帧，并更新公式为：

```text
W_target = W_source_animation · inverse(W_source_bind) · W_target_standing_base
```

运行：

```text
python scripts/animation/retarget_ual2.py --help
```

预期：显示包含可选目标基准片段的 CLI 用法；随后使用实际源文件运行单段候选输出，终端打印 `verify ... PASS`，且站立手部高度明显小于 `-0.4m`。若源文件不存在，停止并报告具体路径，不生成空资源。

### Task 3: 重新生成并验证统一发布 GLB

**Files:**

- Modify: `client/public/anims/cine57/UAL2_UE_Anims.glb`
- Test: `client/src/config/animationLibraryContent.test.mjs`

- [ ] **Step 1: 生成不覆盖发布文件的三个候选结果**

依次以 UAL2 基础 GLB 和前一步输出为输入，输出到明确的外部临时路径；不得直接写入 tracked public 文件：

```text
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_INP_Idle.glb D:/UnrealWorkspace/Cine57-exported/anims/UAL2_UE_Base-DIAG.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-Idle.glb A_INP_Idle
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_INP_WalkFwd_Loop.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-Idle.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-Idle-Walk.glb A_INP_WalkFwd_Loop
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_chair_loop01.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-Idle-Walk.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-All.glb A_chair_loop01
```

每条命令都必须报告 `PASS`；若第二/第三步把前一个候选文件当作 target，`Idle_No_Loop` 必须仍来自 UAL2 基础动画，不能使用刚生成的 Cine57 片段作为基准。

- [ ] **Step 2: 验证候选 GLB 的结构和动作内容**

将 `ANIMBASE-All.glb` 临时复制到发布路径前，先在仓库外创建带时间戳的备份并验证备份存在且大小/hash 与当前发布文件一致；再运行：

```text
$animationBackupPath = Join-Path ([System.IO.Path]::GetTempPath()) ("UAL2_UE_Anims.before-retarget-fix-{0}.glb" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$publishedHash = (Get-FileHash client/public/anims/cine57/UAL2_UE_Anims.glb -Algorithm SHA256).Hash
Copy-Item client/public/anims/cine57/UAL2_UE_Anims.glb $animationBackupPath -Force
$backupHash = (Get-FileHash $animationBackupPath -Algorithm SHA256).Hash
if ($publishedHash -ne $backupHash) { throw "动画发布文件备份校验失败" }
Get-Item $animationBackupPath | Select-Object FullName,Length
Copy-Item D:/UnrealWorkspace/Cine57-exported/anims/ANIMBASE-All.glb client/public/anims/cine57/UAL2_UE_Anims.glb -Force
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

预期备份文件存在且大小/hash 已记录，所有结构和内容断言通过：43 段 UAL2 原生动画仍存在，3 段 Cine57 旋转为 `VEC4` 单位四元数、通道只命中 skin joints，待机/行走/坐姿内容指标通过。若失败，只能从已验证的 `$animationBackupPath` 恢复后继续修复；不得带着失败资源提交。

- [ ] **Step 3: 记录发布资源 hash 和不变量**

运行：

```text
Get-FileHash client/public/anims/cine57/UAL2_UE_Anims.glb -Algorithm SHA256
```

用脚本比较发布前后 JSON 中 `nodes`、`skins`、`meshes` 和前 43 段 UAL2 动画名称/时长；确认只新增/替换 3 段 Cine57 动画采样数据，没有修改网格或 inverse bind matrices。

### Task 4: 扩展 46 段前端目录

**Files:**

- Modify: `client/src/config/animationLibrary.ts`
- Modify: `client/src/config/animationLibrary.test.mjs`

- [ ] **Step 1: 暴露统一 GLB 地址并保留兼容来源常量**

把私有 `UAL2_UE_ANIMS_URL` 改为：

```ts
export const ANIMATION_LIBRARY_FILE_URL = "/anims/cine57/UAL2_UE_Anims.glb";
export const ANIMATION_LIBRARY_SOURCE = "Cine57";
const UAL2_SOURCE = "UAL2";
export const ANIMATION_LIBRARY_CATEGORIES = ["待机", "移动", "坐姿", "其他动作"] as const;
```

继续保留现有三个 Cine57 的 id、中文名、分类、clipName 和兼容入口；新增条目全部指向 `ANIMATION_LIBRARY_FILE_URL`。

- [ ] **Step 2: 写入 43 个 UAL2 条目并检查一一对应**

按下表建立稳定条目，时长取已发布 GLB 的采样器最大时间并保留两位小数；清单顺序与 GLB 顺序一致，便于检查和缩略图队列审计：

| clipName | id | category | name | duration |
|---|---|---|---|---:|
| `A_TPose` | `ual2-a-tpose` | 其他动作 | T 形姿势 | 2.50 |
| `Chest_Open` | `ual2-chest-open` | 其他动作 | 打开胸口 | 1.37 |
| `ClimbUp_1m_RM` | `ual2-climb-up` | 移动 | 攀爬上升 | 0.67 |
| `Consume` | `ual2-consume` | 其他动作 | 进食 | 1.33 |
| `Farm_Harvest` | `ual2-farm-harvest` | 其他动作 | 收获作物 | 2.50 |
| `Farm_PlantSeed` | `ual2-farm-plant-seed` | 其他动作 | 播种 | 2.77 |
| `Farm_Watering` | `ual2-farm-watering` | 其他动作 | 浇水 | 3.80 |
| `Hit_Knockback` | `ual2-hit-knockback` | 其他动作 | 受击后退 | 0.83 |
| `Hit_Knockback_RM` | `ual2-hit-knockback-root-motion` | 移动 | 受击后退（位移） | 0.83 |
| `Idle_FoldArms_Loop` | `ual2-idle-fold-arms` | 待机 | 抱臂待机 | 2.50 |
| `Idle_Lantern_Loop` | `ual2-idle-lantern` | 待机 | 提灯待机 | 2.50 |
| `Idle_No_Loop` | `ual2-idle-no-loop` | 待机 | 自然待机 | 2.50 |
| `Idle_Rail_Call` | `ual2-idle-rail-call` | 待机 | 呼叫待机 | 2.50 |
| `Idle_Rail_Loop` | `ual2-idle-rail` | 待机 | 扶栏待机 | 2.50 |
| `Idle_Shield_Break` | `ual2-idle-shield-break` | 其他动作 | 盾牌破坏 | 1.07 |
| `Idle_Shield_Loop` | `ual2-idle-shield` | 待机 | 持盾待机 | 2.50 |
| `Idle_TalkingPhone_Loop` | `ual2-idle-talking-phone` | 待机 | 打电话待机 | 2.93 |
| `LayToIdle` | `ual2-lay-to-idle` | 其他动作 | 躺姿起身 | 1.53 |
| `Melee_Hook` | `ual2-melee-hook` | 其他动作 | 近战钩击 | 0.47 |
| `Melee_Hook_Rec` | `ual2-melee-hook-recovery` | 其他动作 | 近战钩击收招 | 0.60 |
| `NinjaJump_Idle_Loop` | `ual2-ninja-jump-idle` | 待机 | 跳跃待机 | 2.00 |
| `NinjaJump_Land` | `ual2-ninja-jump-land` | 移动 | 跳跃落地 | 1.27 |
| `NinjaJump_Start` | `ual2-ninja-jump-start` | 移动 | 起跳 | 0.97 |
| `OverhandThrow` | `ual2-overhand-throw` | 其他动作 | 过肩投掷 | 1.33 |
| `Shield_Dash_RM` | `ual2-shield-dash` | 移动 | 持盾冲刺 | 1.10 |
| `Shield_OneShot` | `ual2-shield-one-shot` | 其他动作 | 持盾动作 | 0.83 |
| `Slide_Exit` | `ual2-slide-exit` | 移动 | 滑铲结束 | 0.50 |
| `Slide_Loop` | `ual2-slide-loop` | 移动 | 滑铲循环 | 2.00 |
| `Slide_Start` | `ual2-slide-start` | 移动 | 滑铲开始 | 0.83 |
| `Sword_Block` | `ual2-sword-block` | 其他动作 | 持剑格挡 | 1.23 |
| `Sword_Dash_RM` | `ual2-sword-dash` | 移动 | 持剑冲刺 | 1.57 |
| `Sword_Regular_A` | `ual2-sword-a` | 其他动作 | 剑击 A | 0.43 |
| `Sword_Regular_A_Rec` | `ual2-sword-a-recovery` | 其他动作 | 剑击 A 收招 | 0.97 |
| `Sword_Regular_B` | `ual2-sword-b` | 其他动作 | 剑击 B | 0.53 |
| `Sword_Regular_B_Rec` | `ual2-sword-b-recovery` | 其他动作 | 剑击 B 收招 | 1.03 |
| `Sword_Regular_C` | `ual2-sword-c` | 其他动作 | 剑击 C | 2.00 |
| `Sword_Regular_Combo` | `ual2-sword-combo` | 其他动作 | 连续剑击 | 3.00 |
| `TreeChopping_Loop` | `ual2-tree-chopping` | 其他动作 | 砍树 | 0.97 |
| `Walk_Carry_Loop` | `ual2-walk-carry` | 移动 | 搬运行走 | 2.00 |
| `Yes` | `ual2-yes` | 待机 | 点头回应 | 2.50 |
| `Zombie_Idle_Loop` | `ual2-zombie-idle` | 待机 | 僵尸待机 | 1.33 |
| `Zombie_Scratch` | `ual2-zombie-scratch` | 其他动作 | 僵尸抓挠 | 1.80 |
| `Zombie_Walk_Fwd_Loop` | `ual2-zombie-walk-forward` | 移动 | 僵尸行走 | 1.33 |

三段现有 Cine57 条目继续放在清单末尾：`A_INP_Idle`、`A_INP_WalkFwd_Loop`、`A_chair_loop01`。目录测试必须以 GLB 实际动画集合反向检查，不能只检查手写数组长度。

- [ ] **Step 3: 运行目录测试并修正时长/分类错误**

运行：

```text
node --experimental-strip-types --test client/src/config/animationLibrary.test.mjs
```

预期：46 条目录全部存在于同一个 GLB，43 条 `UAL2`、3 条 `Cine57`，所有分类都有条目且时长误差小于 0.05 秒。

### Task 5: 让 46 段缩略图共享一次 GLB 加载

**Files:**

- Modify: `client/src/pages/animations/animationThumbnailStudio.ts`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`

- [ ] **Step 1: 在工作室初始化阶段加载统一 asset**

导入 `ANIMATION_LIBRARY_FILE_URL`，把 `loadAsset(app, entry.fileUrl, "container")` 从 `render(entry)` 移到 `createAnimationThumbnailStudio()` 的一次性初始化阶段：

```ts
const asset = await loadAsset(app, ANIMATION_LIBRARY_FILE_URL, "container");
const resource = asset.resource as ContainerResource | null;
if (!resource) {
  app.assets.remove(asset);
  studioEnvironment.destroy();
  app.destroy();
  throw new Error("动画文件里没有可显示的角色资源。");
}
const tracks = new Map<string, unknown>();
for (const clipAsset of resource.animations ?? []) {
  const track = clipAsset.resource as AnimTrackLike | null;
  if (track && typeof track.name === "string") tracks.set(track.name, track);
}
```

`render(entry)` 只从 `tracks` 取条目并实例化 `resource`，不再创建或移除 asset；`destroy()` 按 `model.destroy()`、`app.assets.remove(asset)`、环境释放和 `app.destroy()` 的顺序清理。

- [ ] **Step 2: 保持蓝色材质与独立实例清理**

保留：

```ts
setEntityMaterial(model, BLOCKING_3D_BLUE_ACTOR_COLOR);
model.addComponent("anim", { activate: true });
anim.assignAnimation(entry.clipName, track, 0, 1, true);
```

每个条目的 `finally` 仍只销毁自己的 `model`；工作室闲置销毁时才释放共享 asset。将 `STORAGE_KEY` 从 `animation-library:thumbnails:v5` 提升到 `animation-library:thumbnails:v6`，使新的重定向资源和蓝色缩略图不会被旧截图覆盖。

- [ ] **Step 3: 运行源码契约测试**

运行：

```text
node --experimental-strip-types --test client/src/pages/animations/animationPreviewApp.test.mjs
```

预期：验证一次 `loadAsset`、共享资源释放、蓝色材质、代表帧定位和失败重试契约全部通过。

### Task 6: 文档、发布说明和全量自测

**Files:**

- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新 wiki 的稳定规则**

在 `docs/wiki/product/model-library.md` 的动画导出边界中说明：源 UE 片段必须是绝对姿态；目标 UAL2 的 `Idle_No_Loop@40%` 是统一重定向基准；验证顺序是 GLB 结构 → 四元数/skin-joint → 手部/脚部/骨盆内容；UAL1 必须保持独立骨架族。不要写本次修改的文件清单或临时 hash。

- [ ] **Step 2: 按 readme-release-updater 规则更新用户可见说明**

使用 readme-release-updater 检查 Git diff，只记录用户可见结果：动画页现在包含完整的内置与导入动作目录、预览使用统一蓝色角色、站立/行走姿势修正和缩略图自动刷新。README 的“最新更新”只保留最新日期块，其余历史保留在 release notes；不写内部脚本名、测试名或实现过程。

- [ ] **Step 3: 运行代码级自测**

在 worktree 执行：

```text
node --experimental-strip-types --test client/src/config/animationLibrary.test.mjs client/src/config/animationLibraryContent.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs
pnpm --filter @ai-novel/client test
pnpm --filter @ai-novel/client typecheck
git diff --check
```

所有命令必须成功；若发现旧测试中的 v4/v5 缓存契约或来源假设，只修正与本次资源/目录契约对应的断言，不删除测试。

- [ ] **Step 4: 使用 Codex 内置浏览器完成冒烟**

只使用内置 Browser（`iab`）访问 `http://127.0.0.1:5174/animations`：

1. 清理当前内置浏览器隔离会话中的 `animation-library:thumbnails:v4`、`v5` 和旧关键帧缓存，不删除其他站点数据。
2. 打开动画库，确认“全部”显示 `46`，分类计数合计 `46`，网格出现内置动作与三段 Cine57 动作。
3. 等待并截图 `站立待机`、`行走循环`、`坐姿循环`，确认角色为蓝色；打开三个详情页并拖动时间轴/播放暂停，确认角色和动作无异常。
4. 读取页面 console 和网络错误，确认没有失败的 GLB 请求、资源解析错误或未处理异常；记录现有非致命 UI 警告。

如果内置浏览器确实缺少所需能力，记录具体缺口后才考虑最小 fallback；不能静默调用 Chrome。

- [ ] **Step 5: 自审并提交**

对照原始目标逐项检查：完整目录、统一 UAL2 角色、导入站立/行走手部修正、脚部/坐姿未回归、蓝色预览、无重复 GLB 解析。确认 worktree 只包含本计划文件范围后运行：

```text
git status --short
git diff --stat
git diff --check
git add scripts/animation client/src/config/animationLibrary.ts client/src/config/animationLibrary.test.mjs client/src/config/animationLibraryContent.test.mjs client/src/pages/animations/animationThumbnailStudio.ts client/src/pages/animations/animationPreviewApp.test.mjs client/public/anims/cine57/UAL2_UE_Anims.glb docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "fix: unify animation catalog and retarget poses"
```

不提交外部临时 GLB、截图、日志或本地缓存。

- [ ] **Step 6: 从干净 main 集成、推送和清理**

重新读取 `AGENTS.md` 的 Development Workflow 后，在主工作区确认 clean，运行：

```text
pnpm workflow:integrate codex/animation-library-retarget-fix --push --verify "node --experimental-strip-types --test client/src/config/animationLibrary.test.mjs client/src/config/animationLibraryContent.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs"
```

集成完成后检查 `git status --short`、`git worktree list --porcelain`、`git rev-parse main` 与 `git ls-remote origin refs/heads/main`，确认本地 `main` 与远端一致；只删除本次已经合并的 worktree/branch，保留其他 worktree 和运行中的服务。
