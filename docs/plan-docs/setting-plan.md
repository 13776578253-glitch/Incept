# Settings Page V1

## Summary
`settings` is a standalone two-column page, not a `docs` variant and not a tabbed admin console. The left side is a compact anchor directory for quick jumps only. The right side is one continuous settings surface with grouped sections and row-based controls.

The visual reference comes partly from the Codex and TRAE settings pages, but this project should stay lighter, cleaner, and more restrained. The page should read like a refined preferences document instead of a heavy dashboard.

## Layout Direction
- Left column:
  - compact section directory
  - pure anchor navigation
  - no search in V1
  - no route switching
- Right column:
  - page intro
  - grouped settings blocks
  - continuous vertical reading flow
  - no right rail

## Interaction Rules
- Clicking the left sidebar only jumps to anchors in the current page.
- The right side remains a single continuous page.
- Public preference sections are visible and directly usable in V1.
- Management-related sections stay visible in the page structure but are lighter and more constrained.
- Visitor and admin share one page shell.
- Visitor state shows management sections collapsed by default.
- Future admin state can expand and unlock those sections without changing the outer layout model.

## Content Structure
The page uses three top-level content groups:

### Basic Settings
- `Appearance`
  - theme mode
  - future eye-comfort / filter placeholder
- `Language`
  - zh/en language switch
  - future TTS voice language placeholder
  - future extra language placeholder such as Japanese

### Preference Settings
- lightweight extension area for future reading density, motion intensity, and similar personal preferences
- does not add more sidebar complexity in V1

### Admin and AI
- `Account`
  - thin admin identity state
  - single-owner admin key placeholder
  - future multi-account-compatible structure only at the data level
- `AI`
  - AI key input placeholder
  - default provider / model placeholder
  - workspace capability note placeholder

## Visual Rules
- Prefer continuous row-based settings instead of many detached cards.
- Borders, radius, spacing, and shadows should be lighter than the reference images.
- Locked items should be subtle:
  - disabled controls
  - muted help text
  - small locked / planned badges
- Avoid loud “coming soon” styling.

## V1 Notes
- `settings` is independent from `docs`.
- No real auth backend is included in V1.
- The current mental model is still single-owner first.
- The page should be able to evolve later without changing the current shell strategy.
