# Account And Access Design

## Status

Database and Principal identity foundations implemented on 2026-07-20/21. Login routes, cookies, owner-secret validation, and account UI remain unimplemented.

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

Unauthorized visitors should be redirected to the account section with a validated local `next` path. After login, only same-site paths may be used as redirect targets.

## Planned Data Direction

The existing `User` table is content ownership infrastructure because the importer creates a `system` user. It remains separate from authentication.

Owner identity is a deployment-only `OWNER_ACCESS_SECRET`, not a database account. The database now contains `AccessPrincipal`, `AccessGrant`, and `AccessSession` records. A grant is a hashed credential, a Principal is the revocable access identity, and a session is one browser/device binding. Pro sessions stay valid only while both their Principal and Grant remain active.

Docs access has moved from `guest / member / pro` to `guest / pro / private`. Viewer identity and content access types still need to be separated in application code during the server authentication phase.

## Next Decisions

- Implement server-side owner-secret validation and secure HttpOnly session cookies.
- Add `getCurrentViewer()` and `requireOwner()` server helpers, then protect internal pages and write routes.
- Define owner-secret deployment setup and rotation instructions.
- Define the account settings UI for owner login, logout, grant creation, grant revocation, and session visibility.
