ALTER TABLE "Character" ADD COLUMN "actorKind" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "Character" ADD COLUMN "bodyBuild" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "CharacterCastOptionMember" ADD COLUMN "actorKind" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "CharacterCastOptionMember" ADD COLUMN "bodyBuild" TEXT NOT NULL DEFAULT 'unknown';
