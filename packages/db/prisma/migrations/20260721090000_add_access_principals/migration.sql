CREATE TYPE "AccessPrincipalType" AS ENUM ('invited', 'anonymous');

CREATE TABLE "access_principals" (
  "id" TEXT NOT NULL,
  "type" "AccessPrincipalType" NOT NULL,
  "label" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "access_principals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "access_grants"
  ADD COLUMN "principalId" TEXT;

ALTER TABLE "access_sessions"
  ADD COLUMN "principalId" TEXT,
  ALTER COLUMN "expiresAt" DROP NOT NULL;

CREATE INDEX "access_principals_type_revokedAt_idx"
  ON "access_principals"("type", "revokedAt");
CREATE INDEX "access_principals_expiresAt_idx"
  ON "access_principals"("expiresAt");
CREATE INDEX "access_grants_principalId_idx"
  ON "access_grants"("principalId");
CREATE INDEX "access_sessions_principalId_idx"
  ON "access_sessions"("principalId");

ALTER TABLE "access_grants"
  ADD CONSTRAINT "access_grants_principalId_fkey"
  FOREIGN KEY ("principalId") REFERENCES "access_principals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "access_sessions"
  ADD CONSTRAINT "access_sessions_principalId_fkey"
  FOREIGN KEY ("principalId") REFERENCES "access_principals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "access_grants"
  ADD CONSTRAINT "access_grants_principal_shape_check"
  CHECK (
    ("type" = 'invitation' AND "principalId" IS NOT NULL)
    OR ("type" = 'sharedCode' AND "principalId" IS NULL)
  );

ALTER TABLE "access_sessions"
  ADD CONSTRAINT "access_sessions_identity_shape_check"
  CHECK (
    (
      "role" = 'owner'
      AND "principalId" IS NULL
      AND "grantId" IS NULL
      AND "expiresAt" IS NOT NULL
    )
    OR (
      "role" = 'pro'
      AND "principalId" IS NOT NULL
      AND "grantId" IS NOT NULL
      AND "expiresAt" IS NULL
    )
  );
