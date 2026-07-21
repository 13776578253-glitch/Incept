-- Replace the initial three-level content access enum while preserving rows.
CREATE TYPE "DocAccessRole_new" AS ENUM ('guest', 'pro', 'private');

ALTER TABLE "docs_documents"
  ALTER COLUMN "accessRole" DROP DEFAULT,
  ALTER COLUMN "accessRole" TYPE "DocAccessRole_new"
    USING (
      CASE
        WHEN "accessRole"::text = 'member' THEN 'pro'
        ELSE "accessRole"::text
      END
    )::"DocAccessRole_new",
  ALTER COLUMN "accessRole" SET DEFAULT 'guest';

ALTER TABLE "docs_collections"
  ALTER COLUMN "accessRole" DROP DEFAULT,
  ALTER COLUMN "accessRole" TYPE "DocAccessRole_new"
    USING (
      CASE
        WHEN "accessRole"::text = 'member' THEN 'pro'
        ELSE "accessRole"::text
      END
    )::"DocAccessRole_new",
  ALTER COLUMN "accessRole" SET DEFAULT 'guest';

DROP TYPE "DocAccessRole";
ALTER TYPE "DocAccessRole_new" RENAME TO "DocAccessRole";

CREATE TYPE "AccessSessionRole" AS ENUM ('owner', 'pro');
CREATE TYPE "AccessGrantType" AS ENUM ('invitation', 'sharedCode');

CREATE TABLE "access_grants" (
  "id" TEXT NOT NULL,
  "type" "AccessGrantType" NOT NULL,
  "label" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_sessions" (
  "id" TEXT NOT NULL,
  "role" "AccessSessionRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "grantId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "access_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_grants_credentialHash_key" ON "access_grants"("credentialHash");
CREATE INDEX "access_grants_type_revokedAt_idx" ON "access_grants"("type", "revokedAt");
CREATE INDEX "access_grants_expiresAt_idx" ON "access_grants"("expiresAt");
CREATE UNIQUE INDEX "access_sessions_tokenHash_key" ON "access_sessions"("tokenHash");
CREATE INDEX "access_sessions_role_expiresAt_idx" ON "access_sessions"("role", "expiresAt");
CREATE INDEX "access_sessions_grantId_idx" ON "access_sessions"("grantId");

ALTER TABLE "access_sessions"
  ADD CONSTRAINT "access_sessions_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
