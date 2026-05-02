# Navigation Review

## 1. What carried over well

The current navigation frame keeps the strongest parts of the old implementation:

- Fixed global top bar
- Hover/focus dropdown opening
- Delayed dropdown close on mouse leave
- Route change reset for mobile menu and dropdown state
- Theme and language actions at the global navigation layer

## 2. What was intentionally removed

The old header also contained content that was tied to the previous information architecture and should not be carried over:

- Old `platform` and `resources` groups
- Search entry and CTA button
- Old docs slug assumptions
- Content-specific navigation wording

## 3. Dropdown hold-open logic

The current dropdown behavior follows the old logic pattern:

- Hovering a nav item with groups opens its dropdown immediately
- Leaving the trigger schedules a delayed close
- Entering the dropdown before the delay expires cancels that close
- Leaving the dropdown schedules close again
- Route changes clear dropdown state

That means the "expand and stay open while the pointer moves into the panel" behavior has been preserved structurally.

## 4. Remaining verification note

This has been checked by code comparison and structure review.

It still needs live browser verification for:

- Pointer travel comfort between trigger and dropdown
- Mobile drawer spacing and readability
- Theme contrast in both light and dark mode
