CREATE TABLE "agent_devices" (
  "id" TEXT NOT NULL,
  "ownerAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenHint" TEXT NOT NULL,
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "allowedSources" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_devices_hash_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "agent_devices_sources_check" CHECK (cardinality("allowedSources") BETWEEN 1 AND 7 AND "allowedSources" <@ ARRAY['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode']::TEXT[]),
  CONSTRAINT "agent_devices_version_check" CHECK ("credentialVersion" > 0),
  CONSTRAINT "agent_devices_name_check" CHECK (length("name") BETWEEN 1 AND 80),
  CONSTRAINT "agent_devices_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "owner_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_devices_tokenHash_key" ON "agent_devices"("tokenHash");
CREATE INDEX "agent_devices_ownerAccountId_revokedAt_idx" ON "agent_devices"("ownerAccountId", "revokedAt");
