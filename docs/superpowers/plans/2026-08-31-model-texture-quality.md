# 模型贴图质量修复实施计划

> **执行约束：** 在 `codex/model-texture-quality` 隔离工作区内完成；不修改数据库，不删除源资产，不触碰其他工作区。

## 任务 1：建立回归检查

- 新增 `client/tests/modelTextureQuality.contract.test.js`。
- 检查模型库代表性山石 baseColor 文件存在且达到高质量编码的最低体积阈值。
- 检查模型缩略图缓存键已经进入新版本，避免旧缩略图遮盖修复效果。
- 在任何实现改动前运行该测试，确认当前代码/资产会失败。

## 任务 2：修正入库编码规则

- 修改本机模型入库脚本 `C:\Users\su\AppData\Local\Temp\fbx2gltf-test\build-library-v3.cjs`：将不透明贴图的 FFmpeg `q:v` 从 `82` 改为 `2`，并增加显式 `CINE57_REBUILD_TEXTURES=1` 重建开关。
- 保留 baseColor 的 2048 上限以及 normal/RMA 的 1024 上限；不改变贴图名称、桶映射和 alpha 处理。

## 任务 3：安全重建发布贴图

- 在覆盖前把当前 `client/public/models/cine57/tex` 复制到带时间戳的临时备份目录，并校验文件数量、总字节数和代表性文件存在。
- 按模型清单中的槽位分类，从 Cine57 导出目录找到对应源图，在临时输出目录用 `q:v=2` 重编码全部可匹配的现有 JPEG。
- 全部输出可读且数量匹配后才覆盖工作区发布贴图；未匹配的文件保持原样并记录。
- 记录代表性文件前后尺寸/字节数，确认像素化样本明显脱离低质量编码区间。

## 任务 4：刷新运行时缓存与长期规则

- 将 `thumbnailStudio.ts` 的模型缩略图缓存键从 `v18` 升至 `v19`。
- 更新 `docs/wiki/product/model-library.md` 中的贴图编码规则，明确 `q:v` 是量化值而非百分比。
- 更新 `docs/releases/release-notes.md` 与 README 的最新更新区，记录用户可见的贴图细节改善。

## 任务 5：验证与交付

- 运行贴图契约测试、相关客户端测试、客户端类型检查、构建和 `git diff --check`。
- 运行贴图清单/FFmpeg 可读性检查。
- 依据项目 Self-Test 规则，用内置浏览器访问模型库和一个模型 3D 预览，确认模型加载、纹理细节和控制台/网络状态；端口冲突时不终止其他任务。
- 自检 diff 后签名提交；从干净 `main` 集成、推送 `origin/main`，确认远端 SHA 与本地一致，再清理本任务工作区与分支。
