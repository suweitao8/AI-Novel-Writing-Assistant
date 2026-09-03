ALTER TABLE "DramaCharacter" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "DramaCharacter" ADD COLUMN "actorKind" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "DramaCharacter" ADD COLUMN "bodyBuild" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "DramaCharacterLibrary" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "DramaCharacterLibrary" ADD COLUMN "actorKind" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "DramaCharacterLibrary" ADD COLUMN "bodyBuild" TEXT NOT NULL DEFAULT 'unknown';
