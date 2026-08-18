-- 设定中心实体属性扩展：角色年龄段/面部锚点，场景类型/环境提示词，道具类型/视觉提示词
ALTER TABLE "Character" ADD COLUMN "ageGroup" TEXT;
ALTER TABLE "Character" ADD COLUMN "facePrompt" TEXT;
ALTER TABLE "NovelScene" ADD COLUMN "sceneType" TEXT;
ALTER TABLE "NovelProp" ADD COLUMN "propType" TEXT NOT NULL DEFAULT 'object';
ALTER TABLE "NovelProp" ADD COLUMN "visualPrompt" TEXT;
