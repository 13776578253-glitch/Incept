# Owner Server Authentication Milestone

## Status

Completed and manually accepted on 2026-07-22. This stage establishes the first real server-side Owner authentication loop without adding an account page UI or pro credential redemption.

## Scope

The implementation covers only the sole site Owner.

- Owner authentication uses `OWNER_ACCESS_SECRET` from the Web server environment.
- The secret is verified only on the server and is never stored in PostgreSQL, sent back in an API response, or committed to Git.
- A successful login creates an `owner` `AccessSession` in PostgreSQL.
- The browser receives only an opaque random session token in an HttpOnly cookie; PostgreSQL stores the SHA-256 token hash.
- Existing pro Principal, Grant, and Session tables are not yet exposed through a browser flow.

## Architecture

```text
Browser POST /api/auth/owner/login
  -> validate same-site Origin
  -> compare supplied secret with OWNER_ACCESS_SECRET
  -> generate random 32-byte token
  -> store SHA-256 token hash in AccessSession(role=owner)
  -> write incept-access-session HttpOnly cookie

Later server request
  -> read cookie token
  -> hash token
  -> find valid AccessSession
  -> getCurrentViewer(): guest | pro | owner
  -> requireOwner(): Owner or not found
```

The Web auth layer is separate from `@incept/db/access`:

- `@incept/db/access` owns session persistence, expiry, and revocation.
- `apps/web/src/server/auth` owns environment validation, cryptography, cookie transport, viewer resolution, and page guards.
- `proxy.ts` remains i18n-only and is not treated as an authorization boundary.

## API And Cookie

### Owner login

`POST /api/auth/owner/login`

Request body:

```json
{ "secret": "OWNER_ACCESS_SECRET value" }
```

- `204`: Owner session created and cookie written.
- `400`: invalid JSON/body.
- `401`: secret does not match.
- `403`: request Origin is not the current site.
- `503`: `OWNER_ACCESS_SECRET` is missing or too short.

### Logout

`POST /api/auth/logout`

The current session is revoked if present, then the cookie is removed. A same-site Origin is required.

### Cookie policy

Cookie name: `incept-access-session`

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` in production
- Owner max age: 30 days

## Protected Surfaces

The following routes require an Owner session and return not found to everyone else:

- `/[locale]/studio/**`
- `/[locale]/docs/import-preview/**`
- `/[locale]/docs/style-lab`
- `POST /[locale]/docs/import-preview/[draftId]/confirm`

The import confirmation route additionally verifies same-site Origin before reading the draft.

## Local Configuration And Operations

Add a random value with at least 32 characters to the untracked `apps/web/.env.local` file:

```env
OWNER_ACCESS_SECRET="replace-with-a-random-local-secret"
```

Generate a value locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Restart `pnpm dev` after changing the environment file.

Emergency session revocation and secret rotation:

```powershell
pnpm auth:revoke-owner-sessions --dry-run
pnpm auth:revoke-owner-sessions --confirm
```

The CLI lists only session metadata and never prints raw tokens or hashes. To rotate the secret, update `.env.local` or the deployment environment, restart the service, revoke all Owner sessions, and log in again.

## Verification

Completed checks:

- `pnpm --filter @incept/db exec tsc --noEmit`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm auth:revoke-owner-sessions --dry-run`
- Temporary database sessions confirmed that all Owner sessions can be revoked and become invalid; test rows were removed.
- Without an Owner cookie, Studio returns `404`.
- Without `OWNER_ACCESS_SECRET`, the login API returns `503`.
- Manual browser review confirmed valid login returns `204`, Owner-only routes open, logout restores `404`, and global revocation invalidates the browser session.

`pnpm --filter web lint` remains unavailable because the project has ESLint 9 but no `eslint.config.*` file. This is a pre-existing tooling configuration gap, not an authentication code failure.

## Deferred

- Settings-page login/logout form and current identity status.
- Individual invitation and shared-code browser redemption.
- Passing the resolved viewer role into Docs and Notes data loaders.
- Grant creation/list/revocation/rotation CLI.
- Resource-specific `AccessEntitlement` records and `restricted` content access.
