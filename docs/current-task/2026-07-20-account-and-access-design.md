# Account And Access Design

## Status

Planning record only. Authentication and account code have not been implemented.

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

Two grant types run in parallel and both create a temporary `pro` session:

1. Individual invitation link: one random bearer link per invited person, with a recipient label, expiry, usage information, and independent revocation.
2. Shared access code: one long-lived code for a broader trusted group, with rotation and revocation.

Both grant records must store only token/code hashes. Revoking a grant invalidates all active sessions created from it.

Bearer links cannot prove the identity of the recipient if they are forwarded. This is acceptable for the first personal-blog version; identity-bound reader accounts are a later option.

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

The existing `User` table is content ownership infrastructure because the importer creates a `system` user. It must not be reused as the authentication account model.

Authentication should introduce dedicated owner/session/grant records. Sessions use random tokens in secure HttpOnly cookies; the database stores token hashes, expiry, revocation state, and the originating grant when applicable.

The existing Docs access enum must eventually move from `guest / member / pro` to `guest / pro / private`. Viewer identity and content access types must be separate in application code.

## Next Decisions

- Select the authentication implementation: custom single-owner credentials with database sessions, or an authentication library.
- Define owner bootstrap: secure CLI setup versus environment-based initial password.
- Set default and maximum expiry policies for individual invitation links, shared-code sessions, and owner sessions.
- Define the account settings UI for owner login, logout, grant creation, grant revocation, and session visibility.
