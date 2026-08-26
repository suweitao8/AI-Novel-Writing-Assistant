# 漫剧 3D HDRI 方向性环境光实施计划

> 设计文档：`docs/superpowers/specs/2026-08-26-drama-hdri-key-light-design.md`

## 目标

在保留 PlayCanvas EnvAtlas 环境照明和 HDRI 半球显示的基础上，从当前 HDRI 的亮部
计算一盏只存在于 viewer 生命周期的方向光，让窗户/太阳方向对角色产生可见的基础打光。

## 任务 1：锁定纯函数契约

**文件：**

- 新增 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.test.mjs`
- 新增 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.ts`

**步骤：**

1. 先写合成等距柱状像素测试：单侧高亮区应把方向推向该侧；高亮颜色应影响主光色；强度必须在边界内；全暗/无效输入返回后备值。
2. 运行该测试，确认在实现模块缺失时按预期失败。
3. 实现不依赖 PlayCanvas 的估算函数和浏览器纹理缩略采样适配，避免把 DOM 逻辑混进数学函数。

## 任务 2：接入 viewer 光源生命周期

**文件：**

- 修改 `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`

**步骤：**

1. 创建并复用一个方向光实体；保留 `EnvLighting.generateLightingSource` 和
   `EnvLighting.generateAtlas` 作为环境光/反射来源。
2. 环境纹理加载成功后读取估算结果，更新方向、颜色和受限强度，并启用方向光。
3. 切换、清除、过期请求、加载失败和销毁时禁用方向光，释放旧资源，恢复中性兜底环境。
4. 像素读取失败只降级为后备主光，不阻断 HDRI 显示和 EnvAtlas；不增加固定补光，
   不把光照结果写入布局或场景参数。

## 任务 3：契约与交付验证

**文件：**

- 修改 `client/tests/dramaBlocking3dStaticHdri.contract.test.js`（如现有契约适合补充）
- 修改 `docs/wiki/workflows/drama-blocking-3d.md`
- 修改 `docs/releases/release-notes.md`
- 修改 `README.md`

**步骤：**

1. 增加文本契约，保护 EnvAtlas 与 HDRI 派生方向光并存、清理生命周期和不落库边界。
2. 运行新增测试、blocking 3D 相关测试、客户端类型检查和必要构建。
3. 在固定端口 5174 的实际页面检查包含亮窗的 HDRI：角色受光方向应与亮部一致，
   切换环境后不能叠加旧光源；记录无法由自动化确认的视觉项。
4. 更新 wiki 的长期运行时规则、release notes 和 README 最新更新。
5. 用签名提交，在干净 main 上通过项目集成脚本合并、显式推送并清理本工作树。
