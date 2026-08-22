-- 角色别名/昵称（小说原文对角色的其他称呼，解析与匹配按别名归一到本名）
ALTER TABLE "Character" ADD COLUMN "aliasesJson" TEXT;
