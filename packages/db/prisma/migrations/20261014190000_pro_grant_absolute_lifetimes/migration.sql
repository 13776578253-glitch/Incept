-- Keep issued relative-lifetime invitations valid while allowing new absolute/permanent invitations.
BEGIN;
ALTER TABLE "access_grants" DROP CONSTRAINT "temporary_grant_mode_check";
ALTER TABLE "access_grants" ADD CONSTRAINT "temporary_grant_mode_check" CHECK (
  "mode" IS NULL OR (
    "type" = 'sharedCode' AND "principalId" IS NULL AND
    "redeemedCount" >= 0 AND "maxRedemptions" IS NOT NULL AND "maxRedemptions" > 0 AND "redeemedCount" <= "maxRedemptions" AND
    (
      ("mode" = 'single' AND "maxRedemptions" = 1 AND (
        ("entitlementSeconds" IS NOT NULL AND "entitlementSeconds" > 0 AND "redeemExpiresAt" IS NOT NULL AND "expiresAt" IS NULL)
        OR ("entitlementSeconds" IS NULL AND "expiresAt" IS NOT DISTINCT FROM "redeemExpiresAt")
      ))
      OR ("mode" = 'shared' AND "redeemExpiresAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" = "redeemExpiresAt" AND "entitlementSeconds" IS NULL)
    )
  )
);
COMMIT;
