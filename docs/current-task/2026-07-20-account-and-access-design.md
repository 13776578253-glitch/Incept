# Account And Access Design

## Status

Database, Principal identity, and Owner server authentication foundations implemented on 2026-07-20/21. Browser account UI and pro credential redemption remain unimplemented.

## Goal

Turn the current local-first personal blog into a site with a single owner and controlled reader access, while keeping public reading simple.

## Content Access

| Content access | Who can read it | Public list and search |
| --- | --- | --- |
| `guest` | Everyone | Visible |
| `pro` | Valid temporary grant holders and the owner | Hidden from guests |
| `private` | Owner only | Never visible outside owner access |

Viewer identity must remain separate from content access:

```text
guest viewer -> guest content
pro viewer   -> guest and pro content
owner/admin  -> guest, pro, and private content; internal operations
```

`admin` represents the sole site owner, not a multi-person management role. It is still required to separate content reading from server-side operations such as publishing, archive actions, invitation management, and internal tools.

## Temporary Access

Two grant types run in parallel. Both create `pro` sessions, but their identities are intentionally different:

1. Individual invitation link: one random bearer link per invited person. It is linked to one persistent `invited` Principal, so the recipient can exchange it on multiple devices. Revoking the Principal invalidates all of that person's sessions and dedicated invitation grants.
2. Shared access code: one long-lived code for a broader trusted group. Each confirmed exchange creates a distinct `anonymous` Principal and session. Revoking the shared grant invalidates every session created from that grant without deleting audit history.

Both grant records must store only token/code hashes. Revoking a grant invalidates all active sessions created from it.

Bearer links cannot prove the real-world identity of the recipient if they are forwarded. The Principal is an access identity rather than a verified user account. This is acceptable for the first personal-blog version.

## Security Boundary

Authentication must be enforced server-side, not only through hidden navigation or `proxy.ts`.

Protected owner-only surfaces include:

- `/[locale]/studio/**`
- `/[locale]/docs/import-preview/**`
- `/[locale]/docs/style-lab`
- Import preview confirmation and all future write routes
- Invitation and shared-code management

The current Owner implementation returns not found for protected internal pages. A future browser login flow may redirect only to a validated same-site `next` path.

The first Owner authentication API deliberately returns 404 for protected internal pages instead of redirecting. It uses `OWNER_ACCESS_SECRET` from the Web server environment, random token hashes in the database, and a secure HttpOnly cookie. Browser account UI and `next` redirects remain a later stage.

## Planned Data Direction

The existing `User` table is content ownership infrastructure because the importer creates a `system` user. It remains separate from authentication.

Owner identity is a deployment-only `OWNER_ACCESS_SECRET`, not a database account. The database now contains `AccessPrincipal`, `AccessGrant`, and `AccessSession` records. A grant is a hashed credential, a Principal is the revocable access identity, and a session is one browser/device binding. Pro sessions stay valid only while both their Principal and Grant remain active.

Docs access has moved from `guest / member / pro` to `guest / pro / private`. Viewer identity and content access types still need to be separated in application code during the server authentication phase.

## Next Decisions

- Add individual invitation and shared-code redemption routes, then resolve pro viewers in Docs and Notes loaders.
- Define the browser account settings UI for Owner login/logout and future grant management.
- Add CLI commands for creating, listing, revoking, and rotating invitation/shared-code grants.
- Define resource-specific `AccessEntitlement` records and `restricted` content access when selective sharing is needed.
