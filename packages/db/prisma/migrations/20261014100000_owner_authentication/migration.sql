-- AlterTable
ALTER TABLE "access_grants" ADD COLUMN     "codeHint" TEXT,
ADD COLUMN     "entitlementSeconds" INTEGER,
ADD COLUMN     "maxRedemptions" INTEGER,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "redeemExpiresAt" TIMESTAMP(3),
ADD COLUMN     "redeemedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "access_sessions" ADD COLUMN     "authenticatedAt" TIMESTAMP(3),
ADD COLUMN     "credentialVersion" INTEGER,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceLabel" TEXT,
ADD COLUMN     "ownerAccountId" TEXT;

-- CreateTable
CREATE TABLE "owner_accounts" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpCiphertext" TEXT,
    "totpLastStep" INTEGER NOT NULL DEFAULT -1,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_challenges" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "needsApproval" BOOLEAN NOT NULL,
    "pendingTotpCiphertext" TEXT,
    "reauthSessionId" TEXT,
    "deviceId" TEXT,
    "deviceLabel" TEXT NOT NULL,
    "networkHash" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_permits" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "challengeId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_devices" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "networkHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_recovery_codes" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pro_redemptions" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pro_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_rate_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "security_audits" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "sessionId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_accounts_username_key" ON "owner_accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "owner_challenges_tokenHash_key" ON "owner_challenges"("tokenHash");

-- CreateIndex
CREATE INDEX "owner_challenges_expiresAt_idx" ON "owner_challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "owner_permits_codeHash_key" ON "owner_permits"("codeHash");

-- CreateIndex
CREATE INDEX "owner_permits_purpose_expiresAt_idx" ON "owner_permits"("purpose", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "owner_devices_tokenHash_key" ON "owner_devices"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "owner_recovery_codes_codeHash_key" ON "owner_recovery_codes"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "pro_redemptions_grantId_deviceHash_key" ON "pro_redemptions"("grantId", "deviceHash");

-- CreateIndex
CREATE INDEX "auth_rate_buckets_expiresAt_idx" ON "auth_rate_buckets"("expiresAt");

-- CreateIndex
CREATE INDEX "security_audits_createdAt_idx" ON "security_audits"("createdAt");

-- AddForeignKey
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "owner_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_challenges" ADD CONSTRAINT "owner_challenges_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_permits" ADD CONSTRAINT "owner_permits_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_permits" ADD CONSTRAINT "owner_permits_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "owner_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_devices" ADD CONSTRAINT "owner_devices_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_recovery_codes" ADD CONSTRAINT "owner_recovery_codes_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_redemptions" ADD CONSTRAINT "pro_redemptions_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_redemptions" ADD CONSTRAINT "pro_redemptions_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "access_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The application supports one Owner account; a default value alone would not enforce this.
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_singleton_check" CHECK ("id" = 'owner');
ALTER TABLE "access_grants" ADD CONSTRAINT "temporary_grant_mode_check" CHECK (
  "mode" IS NULL OR (
    "type" = 'sharedCode' AND "principalId" IS NULL AND "redeemExpiresAt" IS NOT NULL AND
    "redeemedCount" >= 0 AND "maxRedemptions" IS NOT NULL AND "maxRedemptions" > 0 AND "redeemedCount" <= "maxRedemptions" AND
    (("mode" = 'single' AND "maxRedemptions" = 1 AND "entitlementSeconds" IS NOT NULL AND "entitlementSeconds" > 0 AND "expiresAt" IS NULL)
      OR ("mode" = 'shared' AND "expiresAt" IS NOT NULL AND "expiresAt" = "redeemExpiresAt" AND "entitlementSeconds" IS NULL))
  )
);
