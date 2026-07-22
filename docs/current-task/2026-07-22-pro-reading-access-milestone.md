# Pro Reading Access Milestone

## Status

Completed and manually accepted on 2026-07-22. This stage closes the first usable reader-access loop: credentials can be issued locally, redeemed in a browser, represented by a server-side session, and revoked immediately.

## Scope Completed

- `AccessGrant -> AccessPrincipal -> AccessSession` now drives pro access.
- Individual invitations create one persistent `invited` Principal. The same invitation link may create sessions for that Principal on multiple devices.
- Shared codes create a new anonymous Principal for each guest browser that redeems the code.
- Pro sessions use the same `incept-access-session` HttpOnly cookie as Owner sessions, with a browser max age of 400 days.
- Docs and Notes resolve the real server-side viewer. Guest, pro, and owner receive the content levels `guest`, `pro`, and `private` respectively.
- Inaccessible list entries are hidden; direct article and Note access returns `404`.
- A collection and all of its articles must have the same `accessRole` during import. Runtime checks still validate both the collection and its article.

## Credential Operations

```powershell
pnpm auth:grant create-invitation --label "Reader name" --base-url https://example.com --locale zh
pnpm auth:grant create-shared-code --label "Friends"
pnpm auth:grant list
pnpm auth:grant revoke --grant-id <grant-id> --confirm
pnpm auth:grant rotate-shared-code --grant-id <grant-id> --confirm
```

The raw invitation URL or shared code is printed only when it is created or rotated. The list command shows metadata only, never a raw credential or its hash.

### Invitation redemption

The invitation URL has this shape:

```text
https://example.com/zh/settings/access/<credential>
```

Opening it validates the credential, writes the pro cookie, and redirects to `/<locale>/docs`. The response disables caching and referrer forwarding. An invalid, expired, or revoked invitation returns `404`.

### Shared-code redemption

A guest enters the code in the account section of Settings. The browser sends it to a same-origin API; successful redemption writes the pro cookie and changes the account status to pro. An existing pro or owner session is retained rather than creating another Principal or session.

## Revocation Semantics

- Revoking an invitation Grant invalidates every session issued through that invitation.
- Revoking a shared-code Grant invalidates every session issued through that shared code.
- Revoking a Principal is supported in the data layer and invalidates all of its sessions. A management CLI for that operation is intentionally deferred.
- Browser cookies may remain stored after revocation, but their tokens no longer resolve to a valid server-side session; the next server request treats that browser as a guest.

## Shared-Code Rotation Expiry Rule

Rotation creates a new shared Grant and revokes the old Grant plus all sessions it issued.

| Old Grant expiry | Rotate option | New Grant expiry |
| --- | --- | --- |
| Has an expiry | no `--expires-at` | inherits the old expiry |
| Never expires | no `--expires-at` | never expires |
| Any state | explicit `--expires-at` | uses the supplied future expiry |

An already expired shared Grant cannot be rotated without a new future `--expires-at`. This prevents accidentally creating a new code that is immediately unusable.

## Verification

Completed checks:

- `pnpm --filter @incept/db exec tsc --noEmit`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm auth:grant help`
- Grant creation, list, rotation, expiry inheritance/override, and revocation were verified with temporary database rows and then cleaned up.
- Invitation and shared-code redemption, access to pro content, and Grant revocation were manually reviewed.

`git diff --check` reports only the repository's existing Windows line-ending warnings and no whitespace errors.

## Remaining Boundaries

- There is no `auth:principal:list` or `auth:principal:revoke` command yet. This matters only when revoking one anonymous shared-code browser while leaving the shared code valid for others.
- Because each shared-code redemption creates a separate anonymous Principal, it cannot identify the same real person across devices. Use a dedicated invitation when one person needs multi-device access and individual revocation.
- Add rate limiting before exposing credential redemption endpoints on a public deployment.
- Account recovery, reader accounts, resource-specific entitlements, and a browser management interface remain future work.
