-- CORPUS-3: drop sync/folder fields from FirmCorpus
-- El corpus deja de tener carpeta vinculada. Se alimenta via promocion manual.
ALTER TABLE "FirmCorpus" DROP COLUMN IF EXISTS "driveFolderId";
ALTER TABLE "FirmCorpus" DROP COLUMN IF EXISTS "driveFolderUrl";
ALTER TABLE "FirmCorpus" DROP COLUMN IF EXISTS "lastSyncedAt";
ALTER TABLE "FirmCorpus" DROP COLUMN IF EXISTS "syncStatus";
ALTER TABLE "FirmCorpus" DROP COLUMN IF EXISTS "syncProgress";
