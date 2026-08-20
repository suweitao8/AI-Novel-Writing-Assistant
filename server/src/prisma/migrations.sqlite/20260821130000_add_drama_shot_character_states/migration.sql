-- 分镜的每镜角色外观状态（v4：LLM 按台本标注，首帧图按它切换角色形象）
ALTER TABLE "DramaShot" ADD COLUMN "characterStates" TEXT;
