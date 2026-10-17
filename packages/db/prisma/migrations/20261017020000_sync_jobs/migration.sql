CREATE TABLE sync_jobs (
 id UUID PRIMARY KEY, "ownerAccountId" TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
 "deviceId" TEXT NOT NULL REFERENCES agent_devices(id) ON DELETE RESTRICT,
 "activeKey" TEXT UNIQUE, "idempotencyKey" UUID NOT NULL, status TEXT NOT NULL,
 "credentialVersion" INTEGER NOT NULL, "policyHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"dispatchedAt" TIMESTAMP(3),"startedAt" TIMESTAMP(3),"finishedAt" TIMESTAMP(3),"expiresAt" TIMESTAMP(3) NOT NULL,
 "startRevision" BIGINT,"dataRevision" BIGINT,"completionHash" TEXT,result JSONB,"errorCode" TEXT,
 CONSTRAINT sync_jobs_owner_idempotency_key UNIQUE ("ownerAccountId","idempotencyKey"),
 CONSTRAINT sync_jobs_status CHECK(status IN ('queued','dispatched','running','completed','completed_no_change','partial','review_required','failed','offline','expired','cancelled')),
 CONSTRAINT sync_jobs_active CHECK ((status IN ('queued','dispatched','running') AND "activeKey" IS NOT NULL AND "activeKey"="deviceId") OR (status NOT IN ('queued','dispatched','running') AND "activeKey" IS NULL))
);
CREATE INDEX sync_jobs_device_created ON sync_jobs("deviceId","createdAt");
CREATE INDEX sync_jobs_status_expires ON sync_jobs(status,"expiresAt");
