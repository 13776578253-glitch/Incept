# Access Principal Foundation Milestone

## Completed

The Docs access-control foundation is now stored in PostgreSQL and exposed through `@incept/db`.

- Docs content access was simplified to `guest`, `pro`, and `private`.
- Test Docs data was removed; the seed now retains only the content-system user.
- `docs:cleanup-test-data` supports dry-run inspection and explicit cleanup confirmation.
- `docs:archive` archives a locale article instead of physically deleting it.
- `AccessGrant` stores only invitation/shared-code credential hashes and supports expiry and revocation.
- `AccessPrincipal` separates a revocable access identity from its credential and browser sessions.
- A single invitation has one persistent `invited` Principal and can create sessions on multiple devices.
- Each shared-code redemption creates a separate `anonymous` Principal and session.
- Revoking a Principal invalidates that Principal's sessions and dedicated invitation grants.
- Revoking a Grant invalidates every session created from that credential.
- PostgreSQL constraints enforce valid owner/pro Session and invitation/shared-code Grant shapes.

## Verified

- Local migrations through `20260721090000_add_access_principals` were applied successfully.
- Prisma client generation and schema validation passed.
- `@incept/db` and `web` TypeScript checks passed.
- Database behavior was checked with temporary rows that were removed after verification:
  - two invitation redemptions shared one Principal;
  - principal revocation invalidated both sessions and the invitation;
  - two shared-code redemptions created independent anonymous Principals;
  - revoking one anonymous Principal did not affect the other;
  - revoking the shared Grant invalidated its remaining session.

## Next Stage

Connect the database model to real server-side authentication.

- Read and validate `OWNER_ACCESS_SECRET` only on the server.
- Generate and hash random session tokens; store the raw token only in an `HttpOnly` cookie.
- Add `getCurrentViewer()` and `requireOwner()` helpers.
- Add Owner login/logout, individual invitation redemption, and shared-code redemption routes.
- Protect Studio, import preview/confirmation, and Style Lab server-side.
- Pass the resolved `guest | pro | owner` viewer identity to Docs and Notes loaders; unauthorised detail routes return not found.
- Add local CLI commands for creating, listing, revoking, and rotating access grants.

## Deferred

- Resource-specific `AccessEntitlement` records and `restricted` content access.
- A browser-based grant-management interface.
- Verified reader accounts, profile data, and identity recovery.
